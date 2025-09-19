#!/bin/sh

# Start the FastAPI backend with uvicorn.
# Usage:
#   scripts/run_backend.sh [port]

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

PORT="${1:-8000}"

# Prefer uvicorn from venv if present
if [ -x "venv/bin/uvicorn" ]; then
  UVICORN="venv/bin/uvicorn"
else
  UVICORN="uvicorn"
fi

exec "$UVICORN" main:app --host 0.0.0.0 --port "$PORT" --reload


