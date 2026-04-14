#!/usr/bin/env bash
# Start API (port 8000) and Vite (port 5173) together. Ctrl+C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# PIDs listening on TCP 8000 (newline-separated; may be multiple).
api_listen_pids() {
  lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null || true
}

start_uvicorn() {
  if [[ -x venv/bin/uvicorn ]]; then
    venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
  else
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
  fi
}

api_healthy() {
  curl -sf --max-time 2 "http://127.0.0.1:8000/health" >/dev/null 2>&1
}

pids_on_8000() {
  api_listen_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

if [[ -n "$(pids_on_8000)" ]]; then
  if api_healthy; then
    echo "[dev] Reusing healthy API on port 8000 (PID(s): $(pids_on_8000 | tr ' ' ', '))" >&2
  else
    echo "[dev] Port 8000 is taken but /health did not respond — stopping stale listener(s): $(pids_on_8000)" >&2
    # shellcheck disable=SC2046,SC2086
    kill $(api_listen_pids) 2>/dev/null || true
    sleep 1
    if [[ -n "$(pids_on_8000)" ]]; then
      # shellcheck disable=SC2046,SC2086
      kill -9 $(api_listen_pids) 2>/dev/null || true
      sleep 0.5
    fi
    echo "[dev] Starting API (uvicorn) on port 8000…" >&2
    start_uvicorn
  fi
else
  echo "[dev] Starting API (uvicorn) on port 8000…" >&2
  start_uvicorn
fi

(cd frontend && npx vite --host localhost) &
wait
