// Expected values, tolerance bands, and label aliases for the 5 hidden patterns.
// Both server/score.mjs and worker/score.js consume this shape (the worker copy
// at worker/expectations.js must stay in sync).

export const PATTERN_POINTS = 20; // 5 patterns × 20 = 100

export const EXPECTATIONS = {
  pattern_1: {
    description: "A drone flight whose lat/lon trace forms the Israeli flag — two horizontal stripes plus a Star of David hexagram, over a ~500 m × 333 m box near Jerusalem.",
    criteria: [
      { id: "bbox_width", weight: 4, kind: "range", field: "bbox_width_m", min: 400, max: 600 },
      { id: "bbox_height", weight: 4, kind: "range", field: "bbox_height_m", min: 280, max: 380 },
      { id: "center", weight: 4, kind: "point", lat_field: "center_lat", lon_field: "center_lon", lat: 31.77, lon: 35.21, tol: 0.05 },
      { id: "hexagram", weight: 4, kind: "contains_token", field: "components", token: "hexagram" },
      { id: "label", weight: 4, kind: "label" },
    ],
    aliases: [
      "israeli flag", "flag of israel", "israel flag", "il flag",
      "star of david", "magen david", "shield of david", "hexagram",
      "jewish star", "six-pointed star", "six pointed star",
    ],
  },

  pattern_2: {
    description: "A drone scenario whose altitude profile mimics the Apollo 11 lunar descent — peak ~142 m, parabolic descent, a current spike at the famous 1202 alarm moment, and a manual-mode takeover near touchdown.",
    criteria: [
      { id: "peak", weight: 5, kind: "range", field: "peak_altitude_m", min: 130, max: 155 },
      { id: "manual", weight: 5, kind: "range", field: "manual_takeover_seq", min: 1050, max: 1150 },
      { id: "alarm", weight: 5, kind: "range", field: "alarm_event_seq", min: 580, max: 620 },
      { id: "label", weight: 5, kind: "label" },
    ],
    aliases: [
      "apollo 11", "apollo11", "apollo 11 descent", "apollo11 descent",
      "lunar landing", "moon landing", "eagle landing",
      "1969 moon landing", "lem descent",
    ],
  },

  pattern_3: {
    description: "Anomalies whose inter-arrival gaps in seconds form the Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, 21.",
    criteria: [
      { id: "intervals", weight: 7, kind: "exact_array", field: "interval_seconds", expected: [1, 1, 2, 3, 5, 8, 13, 21] },
      { id: "seqs", weight: 7, kind: "exact_array", field: "anomaly_seqs", expected: [10, 20, 40, 70, 120, 200, 330, 540] },
      { id: "label", weight: 6, kind: "label" },
    ],
    aliases: [
      "fibonacci", "fib", "fibonacci sequence", "fibonacci series",
      "golden ratio sequence",
    ],
  },

  pattern_4: {
    description: "The motor[0] temperature is a 1.7-second lagged, 0.3×-scaled echo of the drone's drawn current — a thermal cross-correlation that peaks at lag 17 samples (10 Hz).",
    criteria: [
      { id: "lag", weight: 5, kind: "range", field: "lag_samples", min: 16, max: 18 },
      { id: "gain", weight: 4, kind: "range", field: "gain", min: 0.25, max: 0.35 },
      { id: "source", weight: 3, kind: "exact_string", field: "source_field", expected: "current_a" },
      { id: "target", weight: 3, kind: "starts_with", field: "target_field", prefix: "motor_temp_c" },
      { id: "label", weight: 5, kind: "label" },
    ],
    aliases: [
      "lagged correlation", "lag correlation", "cross correlation",
      "cross-correlation", "thermal lag", "thermal correlation",
      "current to temperature lag", "lagged echo", "delayed correlation",
    ],
  },

  pattern_5: {
    description: "A short ASCII message — 'HELLO COPILOT' — hidden inside the motor[3] temperature channel during MAINT-mode windows: 10 samples per character, one 30-second period between windows.",
    criteria: [
      { id: "message", weight: 8, kind: "normalized_string", field: "decoded_message", expected: "HELLO COPILOT" },
      { id: "carrier", weight: 3, kind: "exact_string", field: "carrier_field", expected: "motor_temp_c[3]" },
      { id: "mode", weight: 3, kind: "exact_string_ci", field: "active_mode", expected: "MAINT" },
      { id: "period", weight: 3, kind: "range", field: "period_s", min: 25, max: 35 },
      { id: "label", weight: 3, kind: "label" },
    ],
    aliases: [
      "ascii in maint", "hidden message", "covert channel",
      "ascii encoding", "encoded message", "secret message",
      "steganography", "hidden ascii",
    ],
  },
};

export function normalizeLabel(s) {
  if (typeof s !== "string") return "";
  return s.toLowerCase().replace(/[_\-/]+/g, " ").replace(/\s+/g, " ").trim();
}
