#!/bin/sh

# Verify import results quickly using sqlite3
# Usage: scripts/verify_import.sh

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DB_PATH="data/schedule_test.db"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

echo "=== IMPORT VERIFICATION ==="
echo "Database: $DB_PATH"

echo "Table counts:"
sqlite3 "$DB_PATH" "SELECT 'campus' AS table_name, COUNT(*) FROM campus
UNION ALL SELECT 'teacher', COUNT(*) FROM teacher
UNION ALL SELECT 'class', COUNT(*) FROM class
UNION ALL SELECT 'lesson', COUNT(*) FROM lesson;" | cat

echo "\nWeeks present:"
sqlite3 "$DB_PATH" "SELECT DISTINCT week FROM lesson ORDER BY week;" | cat

echo "\nSample lessons:"
sqlite3 "$DB_PATH" "SELECT week, day, start_time, end_time FROM lesson ORDER BY week, day, start_time LIMIT 10;" | cat

echo "=== VERIFICATION DONE ==="







