#!/usr/bin/env bash
# Run the leaderboard server with the LLM judge wired to the local Copilot proxy.
#
# Prereq:
#   1) Start the proxy in another terminal:  python3 scripts/judge_proxy.py
#   2) Then run:                             ./scripts/with-judge.sh
#
# Override the model with LLM_JUDGE_MODEL if "claude-sonnet-4.5" isn't available
# on your Copilot plan. Run `python3 scripts/judge_proxy.py --list-models` to see ids.

set -euo pipefail

export LLM_JUDGE_URL="${LLM_JUDGE_URL:-http://127.0.0.1:8788/chat/completions}"
export LLM_JUDGE_TOKEN="${LLM_JUDGE_TOKEN:-copilot-proxy-ignored}"
export LLM_JUDGE_MODEL="${LLM_JUDGE_MODEL:-claude-sonnet-4.5}"

echo "judge: $LLM_JUDGE_URL  model=$LLM_JUDGE_MODEL"
exec node server/server.mjs "$@"
