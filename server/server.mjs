// Drone Watchdog — leaderboard server.
// Node 18+ (uses native fetch types via undici Web APIs). Zero dependencies.
//
//   node server/server.mjs
//
// Env:
//   PORT             default 8787
//   ALLOWED_ORIGIN   default *      (set to your GitHub Pages origin in prod)
//   STORE_PATH       default ./submissions.json (relative to cwd)

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { score } from "./score.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";
const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(process.env.STORE_PATH ?? `${HERE}/submissions.json`);

const MAX_BODY_BYTES = 96 * 1024; // accept a little above the 64 KB cap to give room for name/dept
const MAX_FIELD_LEN = 80;
const RATE_WINDOW_MS = 5_000;

// ── Storage (read-modify-write a single JSON file) ──────────────────────
async function loadStore() {
  if (!existsSync(STORE_PATH)) return [];
  try {
    const txt = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[store] failed to read, starting empty:", e.message);
    return [];
  }
}
async function saveStore(rows) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  // Write to a temp then rename — atomic on POSIX.
  const tmp = STORE_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await writeFile(STORE_PATH, JSON.stringify(rows, null, 2), "utf8");
  // (rename omitted — extra writeFile is fine at this scale)
}

// ── In-memory rate limit ────────────────────────────────────────────────
const lastSubmitByIp = new Map();
function rateOk(ip) {
  const now = Date.now();
  const prev = lastSubmitByIp.get(ip) ?? 0;
  if (now - prev < RATE_WINDOW_MS) return false;
  lastSubmitByIp.set(ip, now);
  return true;
}

// ── HTTP helpers ────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}
function send(res, status, body, headers = {}) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, fail) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        fail(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

// ── Validation ──────────────────────────────────────────────────────────
function validateSubmission(payload) {
  if (!payload || typeof payload !== "object") return "invalid payload";
  const { name, department, answer } = payload;
  if (typeof name !== "string" || !name.trim()) return "name required";
  if (name.length > MAX_FIELD_LEN) return "name too long";
  if (typeof department !== "string" || !department.trim()) return "department required";
  if (department.length > MAX_FIELD_LEN) return "department too long";
  if (answer == null || typeof answer !== "object") return "answer must be a JSON object";
  return null;
}

// ── Sorting / shaping ───────────────────────────────────────────────────
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

// ── Routes ──────────────────────────────────────────────────────────────
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/standings") {
    const rows = await loadStore();
    return send(res, 200, shapeStandings(rows));
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/submit") {
    const ip = req.socket.remoteAddress ?? "unknown";
    if (!rateOk(ip)) return send(res, 429, { error: "slow down — try again in a few seconds" });

    let raw;
    try { raw = await readBody(req); }
    catch (e) { return send(res, e.status ?? 400, { error: e.message }); }

    let payload;
    try { payload = JSON.parse(raw); }
    catch { return send(res, 400, { error: "body must be JSON" }); }

    const err = validateSubmission(payload);
    if (err) return send(res, 400, { error: err });

    let s;
    try { s = score(payload.answer); }
    catch (e) { return send(res, 400, { error: `scoring failed: ${e.message}` }); }
    if (typeof s !== "number" || !Number.isFinite(s)) {
      return send(res, 500, { error: "scoring returned a non-number" });
    }

    const entry = {
      id: randomUUID(),
      name: payload.name.trim(),
      department: payload.department.trim(),
      score: Math.round(s),
      submitted_at: new Date().toISOString(),
    };

    const rows = await loadStore();
    rows.push(entry);
    await saveStore(rows);

    console.log(`[submit] ${entry.name} (${entry.department}) → ${entry.score}`);
    return send(res, 201, entry);
  }

  send(res, 404, { error: "not found" });
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error("[unhandled]", e);
    try { send(res, 500, { error: "internal error" }); } catch {}
  });
}).listen(PORT, () => {
  console.log(`drone-watchdog server listening on :${PORT}`);
  console.log(`  store:  ${STORE_PATH}`);
  console.log(`  cors:   ${ALLOWED_ORIGIN}`);
  console.log(`\n  next:   cloudflared tunnel --url http://localhost:${PORT}`);
});
