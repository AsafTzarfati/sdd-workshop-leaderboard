// Tiered label judge: alias dictionary first, LLM fallback on miss.
//
// Cache shape: { [`${patternId}::${normalizedLabel}`]: 0 | 1 }.
// The cache is mutated in place. Persisting it is the caller's job.
//
// LLM is enabled only if both LLM_JUDGE_URL and LLM_JUDGE_TOKEN are set.
// Expected request shape: OpenAI-compatible chat-completion endpoint.

import { EXPECTATIONS, normalizeLabel } from "./expectations.mjs";

const URL_ENV = "LLM_JUDGE_URL";
const TOKEN_ENV = "LLM_JUDGE_TOKEN";
const MODEL_ENV = "LLM_JUDGE_MODEL";
const TIMEOUT_MS = 5_000;

export async function judgeLabel(patternId, rawLabel, cache) {
  const norm = normalizeLabel(rawLabel);
  if (!norm) return { credit: 0, source: "miss" };

  const aliases = EXPECTATIONS[patternId]?.aliases ?? [];
  if (aliases.includes(norm)) return { credit: 1, source: "alias" };

  const key = `${patternId}::${norm}`;
  if (cache && Object.prototype.hasOwnProperty.call(cache, key)) {
    return { credit: cache[key] ? 1 : 0, source: "cache" };
  }

  const url = process.env[URL_ENV];
  const token = process.env[TOKEN_ENV];
  if (!url || !token) return { credit: 0, source: "miss" };

  const description = EXPECTATIONS[patternId]?.description ?? "";
  const verdict = await callJudge(url, token, process.env[MODEL_ENV] ?? "gpt-4o-mini", description, rawLabel).catch(
    (e) => {
      console.error(`[judge] ${patternId} LLM call failed:`, e.message);
      return null;
    }
  );

  if (verdict === null) return { credit: 0, source: "miss" };
  if (cache) cache[key] = verdict ? 1 : 0;
  return { credit: verdict ? 1 : 0, source: "llm" };
}

async function callJudge(url, token, model, description, label) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "You decide whether a short user-supplied label is a correct name for a known pattern. Reply with exactly one token: YES or NO.",
          },
          {
            role: "user",
            content: `Pattern: ${description}\n\nLabel: ${JSON.stringify(label)}\n\nIs this label a correct name for the pattern? Answer YES or NO.`,
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`judge http ${res.status}`);
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content ?? "";
    return /\byes\b/i.test(txt);
  } finally {
    clearTimeout(t);
  }
}
