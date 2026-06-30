#!/usr/bin/env bash
# Local mirror of the pull-request smoke gates in .github/workflows/smoke.yml.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> version, lint, typecheck"
npm run agentlint:gate
npm run version:check
npm run mex:check
npm run lint
if [ ! -x ".venv/bin/mypy" ]; then
  echo "[run-ci-local] mypy missing; running ./scripts/bootstrap-python.sh" >&2
  ./scripts/bootstrap-python.sh
fi
.venv/bin/mypy vendor/python
.venv/bin/mypy bridge.py prompt_templates.py bridge_lib
.venv/bin/mypy scripts

echo "==> prompt templates"
./scripts/run-python-tests.sh tests/test_prompt_template.py -q

echo "==> canon and self-contained units"
./scripts/check-canon-drift.sh
./scripts/run-python-tests.sh tests/test_training_store.py tests/test_training_derivation.py -q
./scripts/run-js-unit-tests.sh

echo "==> scripted loop and bridge gates"
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  ./socratink-tui --scripted fixtures/source_less_script.json --color=never

./scripts/run-python-tests.sh \
  tests/test_bridge_registry.py \
  tests/test_bridge_post_call_hooks.py \
  tests/test_bridge_route_runtime.py \
  tests/test_prompt_eval_repair_dialogue.py \
  tests/test_prompt_eval_evaluator.py \
  tests/test_fake_repair_dialogue_golden.py \
  -q

./socratink-harness replay
./socratink-harness routing-proof

echo "==> loop chat UI server-backed test"
LOOP_TEST_PORT="${SOCRATINK_LOOP_TEST_PORT:-8787}"
CI_ENV_FILE=".qa-runs/validation-entrypoints/missing.env"
mkdir -p "$(dirname "$CI_ENV_FILE")"
: > "$CI_ENV_FILE"
server_pid=""
cleanup_server() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" 2>/dev/null || true
  fi
}

SOCRATINK_TUI_ENV_FILE="$CI_ENV_FILE" \
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
PORT="$LOOP_TEST_PORT" \
  node --no-warnings loop-server.mjs &
server_pid=$!
trap cleanup_server EXIT

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${LOOP_TEST_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${LOOP_TEST_PORT}/health" >/dev/null
SOCRATINK_LOOP_BASE_URL="http://127.0.0.1:${LOOP_TEST_PORT}" \
  node --test tests/js/loop-chat-ui.test.mjs

cleanup_server
trap - EXIT

echo "==> workspace smoke and app contract"
./scripts/run-python-tests.sh tests/test_workspace_smoke.py tests/test_app_contract.py -q

echo "[run-ci-local] OK"
