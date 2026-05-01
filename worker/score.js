// Scoring rule for the workshop (Cloudflare Workers build).
// Mirror of server/score.mjs — keep both in sync.
// 5 patterns × 20 points = 100. Criteria within a pattern split that 20 by weight.
// Throws if `answer` is not a JSON object.

import { EXPECTATIONS, PATTERN_POINTS, normalizeLabel } from "./expectations.js";
import { judgeLabel } from "./judge.js";

export async function score(answer, opts = {}) {
  if (answer == null || typeof answer !== "object") {
    throw new Error("answer must be a JSON object");
  }
  const cache = opts.cache ?? null;
  const env = opts.env ?? null;

  let total = 0;
  for (const patternId of Object.keys(EXPECTATIONS)) {
    const submitted = answer[patternId];
    if (submitted == null || typeof submitted !== "object") continue;
    total += await gradePattern(patternId, submitted, cache, env);
  }
  return Math.round(total);
}

async function gradePattern(patternId, submitted, cache, env) {
  const spec = EXPECTATIONS[patternId];
  const totalWeight = spec.criteria.reduce((s, c) => s + c.weight, 0);
  let earnedWeight = 0;

  for (const c of spec.criteria) {
    if (c.kind === "label") {
      const { credit } = await judgeLabel(patternId, submitted.label, cache, env);
      if (credit) earnedWeight += c.weight;
    } else if (gradeStructural(c, submitted)) {
      earnedWeight += c.weight;
    }
  }

  return (earnedWeight / totalWeight) * PATTERN_POINTS;
}

function gradeStructural(c, submitted) {
  switch (c.kind) {
    case "range": {
      const v = submitted[c.field];
      return typeof v === "number" && Number.isFinite(v) && v >= c.min && v <= c.max;
    }
    case "point": {
      const lat = submitted[c.lat_field];
      const lon = submitted[c.lon_field];
      if (typeof lat !== "number" || typeof lon !== "number") return false;
      return Math.abs(lat - c.lat) <= c.tol && Math.abs(lon - c.lon) <= c.tol;
    }
    case "contains_token": {
      const arr = submitted[c.field];
      if (!Array.isArray(arr)) return false;
      const target = c.token.toLowerCase();
      return arr.some((x) => typeof x === "string" && x.toLowerCase().includes(target));
    }
    case "exact_array": {
      const arr = submitted[c.field];
      if (!Array.isArray(arr) || arr.length !== c.expected.length) return false;
      return c.expected.every((e, i) => Number(arr[i]) === e);
    }
    case "exact_string": {
      return submitted[c.field] === c.expected;
    }
    case "exact_string_ci": {
      const v = submitted[c.field];
      return typeof v === "string" && v.toUpperCase() === c.expected.toUpperCase();
    }
    case "starts_with": {
      const v = submitted[c.field];
      return typeof v === "string" && v.startsWith(c.prefix);
    }
    case "normalized_string": {
      return normalizeLabel(submitted[c.field]) === normalizeLabel(c.expected);
    }
    default:
      return false;
  }
}
