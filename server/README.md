# Drone Watchdog — server

One-day leaderboard backend. Zero deps, plain Node. Runs on your laptop.

## Day-of run

```sh
# 1. Edit the scoring rule
$EDITOR server/score.mjs        # drop in the real rule

# 2. Start the server
node server/server.mjs
# → drone-watchdog server listening on :8787

# 3. In another shell — public HTTPS tunnel (no signup for trycloudflare.com)
cloudflared tunnel --url http://localhost:8787
# → copy the printed https://<random>.trycloudflare.com URL

# 4. Paste that URL into design/index.html → BACKEND_URL, push to main
#    GitHub Pages republishes in ~30s.

# 5. Keep the laptop awake
caffeinate -dimsu
```

## Endpoints

- `GET /health` → `{ ok: true }`
- `GET /standings` → `{ count, rows: [{ rank, name, department, score, submitted_at }] }`, sorted desc by score
- `POST /submit` → JSON body `{ name, department, answer }` → returns the new entry with its computed score

## Env vars

| var              | default                        | notes                                          |
| ---------------- | ------------------------------ | ---------------------------------------------- |
| `PORT`           | `8787`                         |                                                |
| `ALLOWED_ORIGIN` | `*`                            | set to your `https://<user>.github.io` in prod |
| `STORE_PATH`     | `./server/submissions.json`    | the JSON file we append to                     |
| `LLM_JUDGE_URL`  | _(unset)_                      | OpenAI-compatible `/chat/completions` endpoint for label-synonym judging. Without it, novel label phrasings cost up to ~4 pts per pattern (structural credit unaffected). |
| `LLM_JUDGE_TOKEN`| _(unset)_                      | bearer token for the judge endpoint            |
| `LLM_JUDGE_MODEL`| `gpt-4o-mini`                  | model id sent in the chat-completion request   |

Example for the day:
```sh
ALLOWED_ORIGIN="https://your-user.github.io" node server/server.mjs
```

## LLM judge via GitHub Copilot (Sonnet 4.6)

A small Python proxy in [scripts/judge_proxy.py](../scripts/judge_proxy.py) reuses
[ssd-speckit-workshop/github_auth.py](../../ssd-speckit-workshop/github_auth.py)
to talk to Copilot, then exposes a plain OpenAI-style endpoint that `judge.mjs`
can hit unchanged.

```sh
# Terminal 1 — start the proxy (first run does the device-flow login)
python3 scripts/judge_proxy.py
# optional: see which model ids your plan exposes
python3 scripts/judge_proxy.py --list-models

# Terminal 2 — run the leaderboard with judge env wired up
./scripts/with-judge.sh
# (equivalent to setting LLM_JUDGE_URL/LLM_JUDGE_TOKEN/LLM_JUDGE_MODEL by hand)
```

The Cloudflare Worker can't run Python, so for the worker path use a different
provider's bearer token directly (set `LLM_JUDGE_URL`/`LLM_JUDGE_TOKEN`/
`LLM_JUDGE_MODEL` as Worker secrets).

## Storage

Plain JSON file at `server/submissions.json`. Gitignored. Delete it to reset.

## Limits

- 64 KB max for `answer.json`
- 80 char max for name + department
- 1 submit per IP per 5s (in-memory, resets on restart)
- No auth — public tunnel URL is the only "secret". Don't share it outside the workshop.
