"""Local OpenAI-compatible proxy to GitHub Copilot for the leaderboard's label judge.

Why this exists:
  judge.mjs speaks plain HTTPS to an OpenAI-style /chat/completions endpoint with a
  static bearer token. Copilot's API needs a short-lived JWT plus a specific set of
  editor headers, refreshed periodically. Rather than port that auth dance to JS,
  we run this tiny Python proxy that reuses the workshop's existing CopilotAuth.

Run:
  python3 scripts/judge_proxy.py            # listens on 127.0.0.1:8788
  python3 scripts/judge_proxy.py --port 9000

Then, in the leaderboard server's environment:
  export LLM_JUDGE_URL=http://127.0.0.1:8788/chat/completions
  export LLM_JUDGE_TOKEN=ignored       # not used; proxy attaches the real Copilot JWT
  export LLM_JUDGE_MODEL=claude-sonnet-4.5

First run triggers the Copilot device-flow login and caches the OAuth token at
ssd-speckit-workshop/.copilot_token.json (same place the workshop students use).
"""

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import requests

# Reuse the workshop's auth module so we don't duplicate the OAuth/JWT logic.
WORKSHOP_DIR = Path(__file__).resolve().parents[2] / "ssd-speckit-workshop"
sys.path.insert(0, str(WORKSHOP_DIR))
from github_auth import CopilotAuth  # noqa: E402

auth = CopilotAuth()


def ensure_login():
    if not auth.is_logged_in():
        print("Not logged in to Copilot. Starting device flow...")
        auth.login()
    print(f"Authed as {auth.username}; chat endpoint = {auth.chat_url}")


def list_models():
    """Best-effort: hit the Copilot models endpoint so the operator can see valid IDs."""
    base = auth.chat_url.rsplit("/chat/completions", 1)[0]
    try:
        r = requests.get(f"{base}/models", headers=auth.get_headers(), timeout=10)
        if not r.ok:
            print(f"(models list unavailable: HTTP {r.status_code})")
            return
        ids = sorted({m.get("id") for m in r.json().get("data", []) if m.get("id")})
        if ids:
            print("Available Copilot models:")
            for mid in ids:
                print(f"  - {mid}")
    except Exception as e:
        print(f"(models list failed: {e})")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/health", "/"):
            self._send_json(200, {"ok": True, "user": auth.username})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.endswith("/chat/completions"):
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"error": "body must be JSON"})
            return

        try:
            r = requests.post(
                auth.chat_url,
                headers=auth.get_headers(),
                json=payload,
                timeout=30,
            )
        except requests.RequestException as e:
            self._send_json(502, {"error": f"upstream failed: {e}"})
            return

        self.send_response(r.status_code)
        self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(r.content)))
        self.end_headers()
        self.wfile.write(r.content)

    def _send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[judge-proxy] {self.address_string()} {fmt % args}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--list-models", action="store_true", help="print available Copilot model ids and exit")
    args = ap.parse_args()

    ensure_login()
    if args.list_models:
        list_models()
        return

    print(f"Judge proxy listening on http://{args.host}:{args.port}")
    print(f"  POST /chat/completions  → {auth.chat_url}")
    HTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
