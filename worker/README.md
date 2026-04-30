# Drone Watchdog — Cloudflare Worker

Always-on backend. Free tier covers this volume forever.

## One-time setup

```sh
# 1. Sign up (free): https://dash.cloudflare.com/sign-up

# 2. Install deps + log in
cd worker
npm install
npx wrangler login          # opens browser → authorize

# 3. Create the KV namespace
npx wrangler kv namespace create LEADERBOARD
```

The last command prints something like:
```
🌀 Creating namespace with title "drone-watchdog-LEADERBOARD"
✨ Success!
[[kv_namespaces]]
binding = "LEADERBOARD"
id = "abc123def456…"
```

Open `wrangler.toml` and replace `REPLACE_WITH_KV_NAMESPACE_ID` with that `id`.

## Deploy

```sh
npx wrangler deploy
```

Wrangler prints your Worker URL, e.g.
```
Published drone-watchdog
  https://drone-watchdog.<your-subdomain>.workers.dev
```

## Wire the frontend

Edit `index.html` (root of the repo), find:
```js
const BACKEND_URL = "http://localhost:8787";
```

Replace with the Worker URL printed above:
```js
const BACKEND_URL = "https://drone-watchdog.<your-subdomain>.workers.dev";
```

Commit + push. GitHub Pages republishes in ~30s.

## Lock down CORS (optional, recommended)

Once it works, edit `wrangler.toml`:
```toml
[vars]
ALLOWED_ORIGIN = "https://asaftzarfati.github.io"
```

Then `npx wrangler deploy` again.

## Drop in the real scoring rule

Edit `worker/score.js` → redeploy:
```sh
npx wrangler deploy
```

## Useful commands

```sh
npx wrangler tail                            # live logs
npx wrangler kv key get --binding=LEADERBOARD submissions   # see raw data
npm run kv:reset                                            # wipe submissions
```

## What it costs

Free tier:
- **100,000 Worker requests/day** — you'll use ~hundreds
- **100,000 KV reads/day, 1,000 KV writes/day** — you'll use ~tens

Effectively free. No credit card required for the free tier.
