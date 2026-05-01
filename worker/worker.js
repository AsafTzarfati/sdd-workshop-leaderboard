// Drone Watchdog — leaderboard, on Cloudflare Workers + KV.
// Two endpoints: GET /standings, POST /submit.
//
// KV binding name: LEADERBOARD (configured in wrangler.toml).
// Storage shape: a single key "submissions" → JSON array of entries.

import { score } from "./score.js";

const KEY = "submissions";
const CACHE_KEY = "judge_cache";
const MAX_FIELD_LEN = 80;
const MAX_ANSWER_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 5_000;

// Per-isolate IP rate limit. Workers spin up many isolates so this is best-effort, not airtight.
const lastSubmitByIp = new Map();

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, env, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env), ...extra },
  });
}

function shapeStandings(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.submitted_at.localeCompare(b.submitted_at);
  });
  return {
    count: sorted.length,
    rows: sorted.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      department: r.department,
      score: r.score,
      submitted_at: r.submitted_at,
    })),
  };
}

function validate(payload) {
  if (!payload || typeof payload !== "object") return "invalid payload";
  const { name, department, answer } = payload;
  if (typeof name !== "string" || !name.trim()) return "name required";
  if (name.length > MAX_FIELD_LEN) return "name too long";
  if (typeof department !== "string" || !department.trim()) return "department required";
  if (department.length > MAX_FIELD_LEN) return "department too long";
  if (answer == null || typeof answer !== "object") return "answer must be a JSON object";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, env);
    }

    if (request.method === "GET" && url.pathname === "/standings") {
      const rows = (await env.LEADERBOARD.get(KEY, "json")) ?? [];
      return json(shapeStandings(rows), 200, env);
    }

    if (request.method === "POST" && url.pathname === "/submit") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const now = Date.now();
      const prev = lastSubmitByIp.get(ip) ?? 0;
      if (now - prev < RATE_WINDOW_MS) {
        return json({ error: "slow down — try again in a few seconds" }, 429, env);
      }
      lastSubmitByIp.set(ip, now);

      // Reject overly large bodies before parsing.
      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > MAX_ANSWER_BYTES + 4096) {
        return json({ error: "body too large" }, 413, env);
      }

      let payload;
      try { payload = await request.json(); }
      catch { return json({ error: "body must be JSON" }, 400, env); }

      const err = validate(payload);
      if (err) return json({ error: err }, 400, env);

      const cache = (await env.LEADERBOARD.get(CACHE_KEY, "json")) ?? {};
      const cacheBefore = JSON.stringify(cache);

      let s;
      try { s = await score(payload.answer, { cache, env }); }
      catch (e) { return json({ error: `scoring failed: ${e.message}` }, 400, env); }
      if (typeof s !== "number" || !Number.isFinite(s)) {
        return json({ error: "scoring returned a non-number" }, 500, env);
      }

      const entry = {
        id: crypto.randomUUID(),
        name: payload.name.trim(),
        department: payload.department.trim(),
        score: Math.round(s),
        submitted_at: new Date().toISOString(),
      };

      // Read-modify-write the single "submissions" key.
      // For ~20 colleagues this is fine; concurrent writes within a 60s window can race
      // (last writer wins for the array contents — acceptable for a one-day event).
      const rows = (await env.LEADERBOARD.get(KEY, "json")) ?? [];
      rows.push(entry);
      await env.LEADERBOARD.put(KEY, JSON.stringify(rows));

      // Only write the judge cache back if it actually grew (avoids a needless KV write per submit).
      if (JSON.stringify(cache) !== cacheBefore) {
        await env.LEADERBOARD.put(CACHE_KEY, JSON.stringify(cache));
      }

      return json(entry, 201, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
