#!/usr/bin/env bash
# Start API (port 8000) and Vite (port 5173) together. Ctrl+C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ -x venv/bin/uvicorn ]]; then
  venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
else
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
fi

(cd frontend && npx vite --host localhost) &
wait
