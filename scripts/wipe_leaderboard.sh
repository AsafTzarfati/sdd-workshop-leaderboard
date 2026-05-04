#!/usr/bin/env bash
# Wipe the live leaderboard's `submissions` KV key.
#
# Usage:
#   bash scripts/wipe_leaderboard.sh           # asks for confirmation
#   bash scripts/wipe_leaderboard.sh --yes     # skip confirmation
#
# Reads the namespace id from worker/wrangler.toml so it can't drift.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$HERE/../worker"
WRANGLER_TOML="$WORKER_DIR/wrangler.toml"

if [[ ! -f "$WRANGLER_TOML" ]]; then
  echo "✗ wrangler.toml not found at $WRANGLER_TOML"
  exit 1
fi

NS_ID="$(grep -E '^id\s*=' "$WRANGLER_TOML" | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')"
if [[ -z "${NS_ID:-}" ]]; then
  echo "✗ could not parse KV namespace id from $WRANGLER_TOML"
  exit 1
fi

echo "Target namespace: LEADERBOARD ($NS_ID)"
echo "Action: overwrite key 'submissions' with []  (irreversible)"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "aborted"; exit 1 ;;
  esac
fi

EMPTY_FILE="$(mktemp)"
trap 'rm -f "$EMPTY_FILE"' EXIT
printf '[]' > "$EMPTY_FILE"

cd "$WORKER_DIR"
npx wrangler kv key put \
  --namespace-id="$NS_ID" \
  --path="$EMPTY_FILE" \
  submissions

echo "✓ submissions wiped"
