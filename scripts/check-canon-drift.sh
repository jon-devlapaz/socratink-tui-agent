#!/usr/bin/env bash
# Verify committed checksums for load-bearing vendored surfaces WITHOUT needing
# the sibling socratink-app on the machine/CI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
GRAPH_CHECKSUMS="$(mktemp)"
PYTHON_SEAM_CHECKSUMS="$(mktemp)"
trap 'rm -f "$GRAPH_CHECKSUMS" "$PYTHON_SEAM_CHECKSUMS"' EXIT

if [ ! -f lib/canon/checksums.sha256 ]; then
  echo "[check-canon-drift] ERROR: lib/canon/checksums.sha256 missing." >&2
  echo "[check-canon-drift] Run ./scripts/sync-canon-from-app.sh to generate it." >&2
  exit 1
fi

grep '  lib/canon/' lib/canon/checksums.sha256 > "$GRAPH_CHECKSUMS" || true
grep '  vendor/python/ai_service.py$' lib/canon/checksums.sha256 > "$PYTHON_SEAM_CHECKSUMS" || true

if [ ! -s "$GRAPH_CHECKSUMS" ]; then
  echo "[check-canon-drift] ERROR: graph canon checksums missing." >&2
  echo "[check-canon-drift] Re-run ./scripts/sync-canon-from-app.sh and commit the result." >&2
  exit 1
fi

if [ ! -s "$PYTHON_SEAM_CHECKSUMS" ]; then
  echo "[check-canon-drift] ERROR: Python seam checksum missing." >&2
  echo "[check-canon-drift] Add vendor/python/ai_service.py to lib/canon/checksums.sha256." >&2
  exit 1
fi

shasum -a 256 -c "$GRAPH_CHECKSUMS" || {
  echo "[check-canon-drift] GRAPH DRIFT: vendored graph canon changed without a sync." >&2
  echo "[check-canon-drift] Re-run ./scripts/sync-canon-from-app.sh and commit the result." >&2
  exit 1
}

shasum -a 256 -c "$PYTHON_SEAM_CHECKSUMS" || {
  echo "[check-canon-drift] PYTHON SEAM DRIFT: vendor/python/ai_service.py changed." >&2
  echo "[check-canon-drift] If intentional, refresh only its checksum with:" >&2
  echo "[check-canon-drift]   shasum -a 256 vendor/python/ai_service.py" >&2
  echo "[check-canon-drift] Then update the matching line in lib/canon/checksums.sha256." >&2
  exit 1
}

echo "[check-canon-drift] OK: graph canon and Python seam checksums match."
