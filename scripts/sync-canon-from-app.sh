#!/usr/bin/env bash
# Re-vendor graph-truth canon (JS) and the Python LLM seam from socratink-app.
# The TUI holds a vendored MIRROR; this is the only sanctioned way to update it.
#
# Usage: ./scripts/sync-canon-from-app.sh [/path/to/socratink-app]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

APP="${1:-../socratink-app}"
if [ ! -d "$APP" ]; then
  echo "[sync-canon] ERROR: socratink-app not found at $APP" >&2
  echo "[sync-canon] Pass the path: ./scripts/sync-canon-from-app.sh /path/to/socratink-app" >&2
  exit 1
fi

# JS graph-truth canon
cp "$APP/public/js/training-store.js" lib/canon/
cp "$APP/public/js/training-derive.js" lib/canon/

# Python LLM seam (whole packages; app_prompts must be the WHOLE dir because
# ai_service.py reads drill/repair-reps prompts at import time).
rsync -a --delete --exclude '__pycache__' "$APP/llm/" vendor/python/llm/
rsync -a --delete --exclude '__pycache__' "$APP/models/" vendor/python/models/
cp "$APP/ai_service.py" vendor/python/
rsync -a --delete --exclude '__pycache__' "$APP/app_prompts/" vendor/python/app_prompts/

# Regenerate drift checksums (verified by the `canon` CI job without needing the
# sibling app present). A diff here is an intentional, reviewed canon bump.
shasum -a 256 \
  lib/canon/training-store.js \
  lib/canon/training-derive.js \
  vendor/python/ai_service.py \
  > lib/canon/checksums.sha256

echo "[sync-canon] OK. Review the diff, then run:"
echo "  .venv/bin/pytest tests/test_training_store.py tests/test_training_derivation.py tests/test_app_contract.py -q"
