#!/bin/sh

# Import an Excel schedule into the local SQLite DB.
# Usage:
#   scripts/run_import.sh [/absolute/path/to/YourSchedule.xlsx] [comma,separated,sheets]
# If no args are provided, defaults to data/Schedule.xlsx and all sheets.

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

FILE_PATH="${1:-data/Schedule.xlsx}"
SHEETS_ARG="${2:-}"

# Prefer python from venv if present
if [ -x "venv/bin/python" ]; then
  PYTHON="venv/bin/python"
else
  PYTHON="python3"
fi

if [ -n "$SHEETS_ARG" ]; then
  echo "Importing $FILE_PATH (sheets: $SHEETS_ARG)"
  "$PYTHON" inspect_schedule.py --file "$FILE_PATH" --sheets "$SHEETS_ARG"
else
  echo "Importing $FILE_PATH (all sheets)"
  "$PYTHON" inspect_schedule.py --file "$FILE_PATH"
fi

echo "Done. DB at data/schedule_test.db"


