#!/bin/sh

# Safe import script with backup functionality
# Usage: scripts/safe_import.sh [path_to_excel_file] [sheet_names]

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

FILE_PATH="${1:-data/Schedule.xlsx}"
SHEETS_ARG="${2:-}"

# Create backup directory
BACKUP_DIR="data/backups"
mkdir -p "$BACKUP_DIR"

# Create timestamp for backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/schedule_test_backup_$TIMESTAMP.db"

echo "=== SAFE IMPORT START ==="
echo "File: $FILE_PATH"
echo "Sheets: ${SHEETS_ARG:-ALL}"

# Check if file exists
if [ ! -f "$FILE_PATH" ]; then
    echo "ERROR: File $FILE_PATH not found"
    exit 1
fi

# Backup existing DB if present
if [ -f "data/schedule_test.db" ]; then
    echo "Creating backup: $BACKUP_FILE"
    cp "data/schedule_test.db" "$BACKUP_FILE"
else
    echo "No existing database to backup"
fi

# Prefer python from venv if present
if [ -x "venv/bin/python" ]; then
  PYTHON="venv/bin/python"
else
  PYTHON="python3"
fi

echo "Running import..."
set +e
if [ -n "$SHEETS_ARG" ]; then
  "$PYTHON" inspect_schedule.py --file "$FILE_PATH" --sheets "$SHEETS_ARG"
else
  "$PYTHON" inspect_schedule.py --file "$FILE_PATH"
fi
STATUS=$?
set -e

if [ $STATUS -ne 0 ]; then
  echo "Import failed with status $STATUS"
  if [ -f "$BACKUP_FILE" ]; then
    echo "Restoring database from backup"
    cp "$BACKUP_FILE" "data/schedule_test.db"
  fi
  exit $STATUS
fi

echo "Import completed successfully"
echo "Database: data/schedule_test.db"
if [ -f "$BACKUP_FILE" ]; then
  echo "Backup: $BACKUP_FILE"
fi
echo "=== SAFE IMPORT DONE ==="







