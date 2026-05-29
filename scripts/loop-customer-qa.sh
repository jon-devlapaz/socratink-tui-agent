#!/usr/bin/env bash
# Customer persona browser QA (Playwright). Exploration only — not a CI gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]]; then
  echo "Run ./scripts/bootstrap-python.sh first." >&2
  exit 1
fi

if ! .venv/bin/python -c "import playwright" 2>/dev/null; then
  echo "Installing requirements-dev.txt (playwright)…" >&2
  .venv/bin/pip install -q -r requirements-dev.txt
  .venv/bin/python -m playwright install chromium
fi

exec .venv/bin/python scripts/loop-customer-qa.py "$@"
