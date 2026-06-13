#!/usr/bin/env bash
# Run the repo-owned Python pytest suite from the local venv.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -x ".venv/bin/python" ]; then
  echo "[run-python-tests] .venv missing; running ./scripts/bootstrap-python.sh" >&2
  ./scripts/bootstrap-python.sh
fi

if ! .venv/bin/python -m pytest --version >/dev/null 2>&1; then
  echo "[run-python-tests] pytest missing; running ./scripts/bootstrap-python.sh" >&2
  ./scripts/bootstrap-python.sh
fi

.venv/bin/python -m pytest "$@"
