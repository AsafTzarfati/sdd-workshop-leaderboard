// Run with:  node --test server/score.test.mjs
//
// Covers the scoring contract that students rely on: structural correctness +
// label aliasing must produce a stable score regardless of phrasing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { score, scoreWithBreakdown } from "./score.mjs";

const PERFECT = {
  pattern_1: {
    label: "Israeli flag",
    bbox_width_m: 500,
    bbox_height_m: 333,
    center_lat: 31.77,
    center_lon: 35.21,
    components: ["stripes", "hexagram"],
  },
  pattern_2: {
    label: "Apollo 11 descent",
    peak_altitude_m: 142,
    manual_takeover_seq: 1100,
    alarm_event_seq: 600,
  },
  pattern_3: {
    label: "Fibonacci",
    interval_seconds: [1, 1, 2, 3, 5, 8, 13, 21],
    anomaly_seqs: [10, 20, 40, 70, 120, 200, 330, 540],
  },
  pattern_4: {
    label: "lagged correlation",
    source_field: "current_a",
    target_field: "motor_temp_c[0]",
    lag_samples: 17,
    gain: 0.3,
  },
};

test("perfect submission scores 100", async () => {
  assert.equal(await score(PERFECT), 100);
});

test("each pattern alone scores 25", async () => {
  for (const id of Object.keys(PERFECT)) {
    const single = { [id]: PERFECT[id] };
    assert.equal(await score(single), 25, `expected 25 for ${id}`);
  }
});

test("missing pattern → 75", async () => {
  const { pattern_4, ...rest } = PERFECT;
  assert.equal(await score(rest), 75);
});

test("malformed answer throws", async () => {
  await assert.rejects(() => score(null), /JSON object/);
  await assert.rejects(() => score("nope"), /JSON object/);
  await assert.rejects(() => score(42), /JSON object/);
});

test("range-criterion boundary: just inside passes, just outside fails", async () => {
  // Pattern 4 lag tolerance is [16, 18].
  const inAns = { pattern_4: { ...PERFECT.pattern_4, lag_samples: 16 } };
  const outAns = { pattern_4: { ...PERFECT.pattern_4, lag_samples: 15 } };
  const inScore = await score(inAns);
  const outScore = await score(outAns);
  assert.equal(inScore, 25, "lag=16 should be full credit");
  assert.ok(outScore < 25, "lag=15 should drop the lag criterion");
  assert.ok(outScore >= 15, "remaining criteria should still earn credit");
});

test("cross-agent fairness: synonym labels score identically", async () => {
  const variants = [
    "Israeli flag",
    "Star of David",
    "hexagram",
    "Magen David",
    "flag of israel",
    "the blue and white banner of the State of Israel",
  ];
  const scores = await Promise.all(
    variants.map((label) => score({ pattern_1: { ...PERFECT.pattern_1, label } }))
  );
  for (const s of scores) assert.equal(s, 25, `synonym mismatch: ${scores.join(",")}`);
});

test("label miss with no LLM configured: structural credit retained", async () => {
  // Make sure no LLM is configured for this test.
  delete process.env.LLM_JUDGE_URL;
  delete process.env.LLM_JUDGE_TOKEN;
  const ans = { pattern_1: { ...PERFECT.pattern_1, label: "the blue and white banner" } };
  const s = await score(ans);
  // Pattern 1 has 5 criteria of weight 4 each (total 20). Missing the label
  // criterion costs 4/20 of 25 points = 5. Expect 20.
  assert.equal(s, 20);
});

test("partial credit on Pattern 3: only the label matches → 6/20 of 25", async () => {
  const ans = {
    pattern_3: {
      label: "Fibonacci",
      interval_seconds: [1, 2, 3], // wrong
      anomaly_seqs: [99], // wrong
    },
  };
  const s = await score(ans);
  // Pattern 3 weights: intervals=7, seqs=7, label=6. Only label hits → 6/20*25 = 7.5 → 8.
  assert.equal(s, 8);
});

test("cache is populated by LLM verdict and reused on second call", async () => {
  // We don't actually call an LLM; we pre-seed the cache to simulate a prior
  // verdict and assert that the second call honours it without LLM env.
  delete process.env.LLM_JUDGE_URL;
  delete process.env.LLM_JUDGE_TOKEN;
  const cache = { "pattern_1::the blue and white banner": 1 };
  const ans = { pattern_1: { ...PERFECT.pattern_1, label: "the blue and white banner" } };
  const s = await score(ans, { cache });
  assert.equal(s, 25, "cached YES verdict should grant full label credit");
});

test("hexagram component check is case-insensitive and substring-tolerant", async () => {
  const ans = {
    pattern_1: { ...PERFECT.pattern_1, components: ["STRIPES", "Star (Hexagram)"] },
  };
  assert.equal(await score(ans), 25);
});

test("Pattern 4 source/target accept both bare and dotted-path field names", async () => {
  // Bare form (canonical, what the schema documents).
  const bare = { pattern_4: { ...PERFECT.pattern_4 } };
  // Dotted form (sub-object prefix; what an LLM that misread the schema
  // might emit).
  const dotted = {
    pattern_4: {
      ...PERFECT.pattern_4,
      source_field: "apollo11.current_a",
      target_field: "apollo11.motor_temp_c[0]",
    },
  };
  assert.equal(await score(bare), 25);
  assert.equal(await score(dotted), 25);
});

test("verbose descriptive labels containing an alias earn label credit (no LLM)", async () => {
  // A real-world detector tends to emit a descriptive sentence rather than a
  // bare alias. The judge must accept those via substring containment so
  // grading does not depend on whether the LLM tier is configured.
  delete process.env.LLM_JUDGE_URL;
  delete process.env.LLM_JUDGE_TOKEN;

  const verboseP4 = {
    pattern_4: {
      ...PERFECT.pattern_4,
      label: "motor_temp_c[0] is a lagged echo of current_a (lag=17, gain=0.3073)",
    },
  };
  assert.equal(await score(verboseP4), 25, "P4 verbose label should earn credit via 'lagged echo'");

  const verboseP2 = {
    pattern_2: { ...PERFECT.pattern_2, label: "Apollo 11 lunar descent" },
  };
  assert.equal(await score(verboseP2), 25, "P2 'Apollo 11 lunar descent' should earn credit via 'apollo 11'");
});

test("non-matching label still misses without LLM (no false positives)", async () => {
  delete process.env.LLM_JUDGE_URL;
  delete process.env.LLM_JUDGE_TOKEN;
  // No alias is a substring of this string — should still drop the label criterion.
  const ans = { pattern_1: { ...PERFECT.pattern_1, label: "the blue and white banner" } };
  assert.equal(await score(ans), 20);
});

test("scoreWithBreakdown returns total + per-pattern map", async () => {
  const { total, breakdown } = await scoreWithBreakdown(PERFECT);
  assert.equal(total, 100);
  assert.deepEqual(breakdown, {
    pattern_1: 25, pattern_2: 25, pattern_3: 25, pattern_4: 25,
  });
});

test("breakdown reflects partial credit and zero for unsubmitted", async () => {
  delete process.env.LLM_JUDGE_URL;
  delete process.env.LLM_JUDGE_TOKEN;
  const ans = {
    pattern_3: {
      label: "Fibonacci",
      interval_seconds: [1, 2, 3],
      anomaly_seqs: [99],
    },
  };
  const { total, breakdown } = await scoreWithBreakdown(ans);
  assert.equal(total, 8);
  assert.equal(breakdown.pattern_3, 8);
  assert.equal(breakdown.pattern_1, 0);
  assert.equal(breakdown.pattern_4, 0);
});
