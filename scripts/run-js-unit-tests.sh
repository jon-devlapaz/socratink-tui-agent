#!/usr/bin/env bash
# Self-contained JS unit suite. Bootstraps .venv when missing because several
# tests import lib/loop-server/runtime.mjs, which preflights .venv/bin/python.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -x ".venv/bin/python" ]; then
  echo "[run-js-unit-tests] .venv missing; running ./scripts/bootstrap-python.sh" >&2
  ./scripts/bootstrap-python.sh
fi

find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print \
  | sort \
  | xargs node --test
