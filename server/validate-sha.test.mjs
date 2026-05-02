// Run with:  node --test server/validate-sha.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPECTED_SHAS, validateTelemetrySha } from "./validate-sha.mjs";

const VALID_SHA = [...EXPECTED_SHAS][0];

test("expected_shas list is populated", () => {
  assert.ok(EXPECTED_SHAS.size > 100, `only ${EXPECTED_SHAS.size} SHAs loaded`);
  assert.ok(/^[a-f0-9]{64}$/.test(VALID_SHA), "first SHA is well-formed");
});

test("missing SHA returns a clear error", () => {
  const err = validateTelemetrySha({});
  assert.match(err, /missing/i);
});

test("non-string SHA returns missing error", () => {
  const err = validateTelemetrySha({ telemetry_window_sha256: 123 });
  assert.match(err, /missing/i);
});

test("malformed SHA (wrong shape) is rejected", () => {
  const err = validateTelemetrySha({ telemetry_window_sha256: "deadbeef" });
  assert.match(err, /64 lowercase hex/);
});

test("uppercase hex is rejected (regex requires lowercase)", () => {
  const upper = VALID_SHA.toUpperCase();
  const err = validateTelemetrySha({ telemetry_window_sha256: upper });
  assert.match(err, /64 lowercase hex/);
});

test("well-formed SHA not in the expected set is rejected", () => {
  const fake = "f".repeat(64);
  const err = validateTelemetrySha({ telemetry_window_sha256: fake });
  assert.match(err, /does not match any window/i);
});

test("a SHA from the expected set passes", () => {
  assert.equal(validateTelemetrySha({ telemetry_window_sha256: VALID_SHA }), null);
});
