// End-to-end LLM-judge smoke test.
//
// Assumes:
//   - The judge proxy is running:    python3 scripts/judge_proxy.py
//   - LLM_JUDGE_URL/LLM_JUDGE_TOKEN/LLM_JUDGE_MODEL are set in this process's env
//     (the wrapper at scripts/run-llm-test.sh does that for you).
//
// Spawns the leaderboard server on a fresh store, posts three fixtures, and
// asserts the judge actually changed the outcome for the novel-label submission.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = join(HERE, "..");
const FIX = join(HERE, "fixtures");

const PORT = process.env.TEST_PORT ?? "8799";
const BASE = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(join(tmpdir(), "judge-test-"));
const STORE = join(tmp, "submissions.json");

console.log(`[test] store: ${STORE}`);
console.log(`[test] judge: ${process.env.LLM_JUDGE_URL || "(disabled)"}  model=${process.env.LLM_JUDGE_MODEL || "(default)"}`);

const env = {
  ...process.env,
  PORT,
  STORE_PATH: STORE,
  ALLOWED_ORIGIN: "*",
};
const server = spawn("node", ["server/server.mjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (b) => process.stdout.write(`[srv] ${b}`));
server.stderr.on("data", (b) => process.stderr.write(`[srv:err] ${b}`));
server.on("exit", (code) => console.log(`[test] server exited code=${code}`));

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("server never became healthy");
}

async function post(fixture) {
  const body = readFileSync(join(FIX, fixture), "utf8");
  const r = await fetch(`${BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${fixture} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

function readStore() {
  return JSON.parse(readFileSync(STORE, "utf8"));
}

let failed = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
}

try {
  await waitForHealth();
  console.log("[test] server up");

  // 1) Perfect submission — alias hit, no LLM needed.
  const a = await post("perfect.json");
  check("perfect.json scores 100", a.score === 100, `got ${a.score}`);
  await sleep(5100); // pass rate-limit window

  // 2) Novel label — alias miss, LLM should grant credit → 100.
  const b = await post("novel-label.json");
  const cacheAfterB = readStore().judge_cache ?? {};
  const novelKeys = Object.keys(cacheAfterB).filter((k) => k.startsWith("pattern_1::") && k.includes("blue"));
  check(
    "novel-label.json scores 100 (LLM YES verdict)",
    b.score === 100,
    `got ${b.score}; cache keys for pattern_1: ${Object.keys(cacheAfterB).filter((k) => k.startsWith("pattern_1::")).join(" | ") || "(none)"}`
  );
  check(
    "judge cache populated by LLM call",
    novelKeys.length > 0 && novelKeys.some((k) => cacheAfterB[k] === 1),
    `keys=${novelKeys.join(",")}  values=${novelKeys.map((k) => cacheAfterB[k]).join(",")}`
  );
  await sleep(5100);

  // 3) Wrong label on a full 5-pattern submission — alias miss, LLM should reject → label criterion lost.
  // Max is 5×20 = 100. Pattern 1 has 5 criteria of weight 4 each; losing the label criterion costs
  // 4 points off pattern_1's 20 → 16 from pattern_1, 20 each from patterns 2..5 → 96/100.
  const c = await post("wrong-label.json");
  const cacheAfterC = readStore().judge_cache ?? {};
  const wrongKey = Object.keys(cacheAfterC).find((k) => k.startsWith("pattern_1::") && k.includes("chessboard"));
  check(
    "wrong-label.json scores 96/100 (LLM NO on label, structural credit retained)",
    c.score === 96,
    `got ${c.score}; chessboard cache value=${wrongKey ? cacheAfterC[wrongKey] : "(missing)"}`
  );
  check(
    "judge cache stored a NO verdict",
    !!wrongKey && cacheAfterC[wrongKey] === 0,
    `key=${wrongKey} value=${wrongKey ? cacheAfterC[wrongKey] : "(missing)"}`
  );
  await sleep(5100);

  // 4) Resubmit novel label — should be served from cache deterministically (no extra LLM call).
  const cacheBefore = JSON.parse(JSON.stringify(readStore().judge_cache ?? {}));
  // Need a different IP to dodge the rate limiter — easiest path is to wait.
  const d = await post("novel-label.json");
  const cacheAfter = readStore().judge_cache ?? {};
  check(
    "resubmit novel-label.json is deterministic (still 100)",
    d.score === 100,
    `got ${d.score}`
  );
  check(
    "cache size unchanged on resubmit (LLM was not re-called)",
    Object.keys(cacheBefore).length === Object.keys(cacheAfter).length,
    `before=${Object.keys(cacheBefore).length} after=${Object.keys(cacheAfter).length}`
  );

  console.log(`\n[test] ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
} catch (e) {
  console.error("[test] aborted:", e);
  failed = 1;
} finally {
  server.kill("SIGTERM");
  await sleep(200);
  process.exit(failed === 0 ? 0 : 1);
}
