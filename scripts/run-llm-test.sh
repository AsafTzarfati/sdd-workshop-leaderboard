#!/usr/bin/env bash
# Run the end-to-end LLM-judge smoke test against a locally-running judge proxy.
#
# Prereq: in another terminal, `python3 scripts/judge_proxy.py` (must be authed).
# Override LLM_JUDGE_MODEL if your Copilot plan exposes a different Sonnet id.

set -euo pipefail

cd "$(dirname "$0")/.."

export LLM_JUDGE_URL="${LLM_JUDGE_URL:-http://127.0.0.1:8788/chat/completions}"
export LLM_JUDGE_TOKEN="${LLM_JUDGE_TOKEN:-copilot-proxy-ignored}"
export LLM_JUDGE_MODEL="${LLM_JUDGE_MODEL:-claude-sonnet-4.5}"

echo "judge: $LLM_JUDGE_URL  model=$LLM_JUDGE_MODEL"

# Quick reachability check so we fail fast with a clear message if the proxy is down.
if ! curl -fsS --max-time 2 "$LLM_JUDGE_URL%/chat/completions/health" >/dev/null 2>&1 \
   && ! curl -fsS --max-time 2 "${LLM_JUDGE_URL%/chat/completions}/health" >/dev/null 2>&1; then
  echo "WARN: proxy health check at ${LLM_JUDGE_URL%/chat/completions}/health failed — is judge_proxy.py running?"
fi

exec node scripts/test-llm-judge.mjs
