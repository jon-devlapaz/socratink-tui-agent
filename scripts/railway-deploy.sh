#!/usr/bin/env bash
# Finish Railway deploy after GitHub push (live Gemini, no API key).
# Requires: railway CLI (`npm i -g @railway/cli`), `railway login`, `.env` with GEMINI_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null; then
  echo "Install: npm i -g @railway/cli"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Copy .env.example to .env and set GEMINI_API_KEY (+ feedback webhook)."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source .env
set +a

unset SOCRATINK_TUI_FAKE_LLM
unset SOCRATINK_LOOP_API_KEY

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is required in .env"
  exit 1
fi

echo "[railway] Ensure project is linked (railway link) or run: railway init"
if ! railway status >/dev/null 2>&1; then
  echo "Not linked. Run: railway init  (or railway link to existing service)"
  exit 1
fi

echo "[railway] Setting variables (live Gemini, no API key)…"
# --skip-deploys avoids CLI timeouts on backboard.railway.com (see Railway Station threads).
railway_var() {
  railway variables set --skip-deploys "$@"
}
railway_var \
  "GEMINI_API_KEY=${GEMINI_API_KEY}" \
  "LLM_MODEL=${LLM_MODEL:-gemini-2.5-flash}" \
  "LOOP_APP_VERSION=${LOOP_APP_VERSION:-v0.01}"

if [[ -n "${SOCRATINK_FEEDBACK_WEBHOOK_URL:-}" ]]; then
  railway_var "SOCRATINK_FEEDBACK_WEBHOOK_URL=${SOCRATINK_FEEDBACK_WEBHOOK_URL}"
fi
if [[ -n "${SOCRATINK_FEEDBACK_SECRET:-}" ]]; then
  railway_var "SOCRATINK_FEEDBACK_SECRET=${SOCRATINK_FEEDBACK_SECRET}"
fi
if [[ -n "${SOCRATINK_FEEDBACK_TO:-}" ]]; then
  railway_var "SOCRATINK_FEEDBACK_TO=${SOCRATINK_FEEDBACK_TO}"
fi

echo "[railway] Deploying from repo (Dockerfile)…"
railway up --detach

echo "[railway] Public URL:"
railway domain 2>/dev/null || railway status
echo ""
echo "Verify: curl -s \"\$(railway domain 2>/dev/null || echo https://YOUR.up.railway.app)/health\" | jq ."
echo "Open:   \$(railway domain 2>/dev/null)/loop"
