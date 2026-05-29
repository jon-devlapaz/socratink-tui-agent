#!/usr/bin/env bash
# Create the standalone TUI Python venv and install the vendored seam's deps.
# No sibling socratink-app required.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PYTHON_BIN="${PYTHON_BOOTSTRAP:-python3}"

# Soft floor: warn (do not hard-fail) if interpreter is below 3.12. The vendored
# slice (pydantic + google-genai) needs a reasonably modern interpreter, but we
# intentionally do NOT pin the app's exact patch version.
ver="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0.0")"
case "$ver" in
  3.1[2-9] | 3.[2-9][0-9] | [4-9].*) : ;;
  *) echo "[bootstrap-python] WARN: $PYTHON_BIN is $ver; >=3.12 recommended" >&2 ;;
esac

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

. ".venv/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt

echo "[bootstrap-python] OK (.venv ready)"
