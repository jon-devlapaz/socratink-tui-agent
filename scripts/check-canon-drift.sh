#!/usr/bin/env bash
# Verify the vendored canon matches the committed checksums. Catches a stale
# vendored copy WITHOUT needing the sibling socratink-app on the machine/CI.
# Fails if anyone edited lib/canon/*.js or vendor/python/ai_service.py without
# re-running sync-canon-from-app.sh (which regenerates checksums.sha256).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f lib/canon/checksums.sha256 ]; then
  echo "[check-canon-drift] ERROR: lib/canon/checksums.sha256 missing." >&2
  echo "[check-canon-drift] Run ./scripts/sync-canon-from-app.sh to generate it." >&2
  exit 1
fi

if shasum -a 256 -c lib/canon/checksums.sha256; then
  echo "[check-canon-drift] OK: vendored canon matches committed checksums."
else
  echo "[check-canon-drift] DRIFT: vendored canon changed without a sync." >&2
  echo "[check-canon-drift] Re-run ./scripts/sync-canon-from-app.sh and commit the result." >&2
  exit 1
fi
