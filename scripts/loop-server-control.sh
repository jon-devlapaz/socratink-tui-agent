#!/usr/bin/env bash
# Shared shell helpers for local and CI loop-server launch paths.

socratink_stop_loop_server_port() {
  local port="${1:-${PORT:-8787}}"
  local label="${2:-loop-server}"
  local existing_pids

  existing_pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  if [[ -z "$existing_pids" ]]; then
    return 0
  fi

  echo "[${label}] stopping existing listener(s) on port ${port}: ${existing_pids//$'\n'/ }"
  # shellcheck disable=SC2086
  kill $existing_pids 2>/dev/null || true

  for _ in {1..30}; do
    if ! lsof -ti "tcp:${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done

  echo "[${label}] port ${port} still in use; try: lsof -i :${port}" >&2
  return 1
}

socratink_wait_loop_server_health() {
  local port="${1:-${PORT:-8787}}"
  local attempts="${2:-30}"
  local delay="${3:-1}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done

  curl -fsS "http://127.0.0.1:${port}/health" >/dev/null
}
