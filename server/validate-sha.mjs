import expectedShasList from "./expected_shas.json" with { type: "json" };

export const EXPECTED_SHAS = new Set(expectedShasList);
const SHA_PATTERN = /^[a-f0-9]{64}$/;

export function validateTelemetrySha(answer) {
  const sha = answer?.telemetry_window_sha256;
  if (typeof sha !== "string" || !sha) {
    return "telemetry_window_sha256 missing — read it from the sim WebSocket frames once you have consumed at least 100 samples";
  }
  if (!SHA_PATTERN.test(sha)) return "telemetry_window_sha256 must be 64 lowercase hex chars";
  if (!EXPECTED_SHAS.has(sha)) {
    return "telemetry_window_sha256 does not match any window the sim has emitted (workshop config: --seed 42 --rate 10)";
  }
  return null;
}
