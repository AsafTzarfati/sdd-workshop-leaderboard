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

Example for the day:
```sh
ALLOWED_ORIGIN="https://your-user.github.io" node server/server.mjs
```

## Storage

Plain JSON file at `server/submissions.json`. Gitignored. Delete it to reset.

## Limits

- 64 KB max for `answer.json`
- 80 char max for name + department
- 1 submit per IP per 5s (in-memory, resets on restart)
- No auth — public tunnel URL is the only "secret". Don't share it outside the workshop.
