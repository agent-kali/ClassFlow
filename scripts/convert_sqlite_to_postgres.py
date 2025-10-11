#!/usr/bin/env python3
"""Convert a SQLite .dump SQL file into PostgreSQL-compatible SQL."""

import re
import sys
from pathlib import Path

LESSON_INSERT_RE = re.compile(r"^(INSERT INTO lesson VALUES\()(.*)(\);)$")


def fix_lesson_values(values_chunk: str) -> str:
    parts = []
    current = []
    depth = 0
    for char in values_chunk:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        if char == ',' and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(char)
    if current:
        parts.append(''.join(current))

    cleaned = []
    for row in parts:
        fields = [f.strip() for f in row.strip()[1:-1].split(',')]
        if len(fields) >= 12:
            # Ensure ID column is not empty
            if fields[0] == '' or fields[0].upper() == 'NULL':
                # Skip rows without IDs; rely on auto increment or add later
                continue
            # Remove month_week_id if empty strings (convert to NULL)
            if fields[8] == "''" or fields[8] == '' or fields[8].upper() == 'NULL':
                fields[8] = 'NULL'
            # Normalize week, month, year to integers if present
            for idx in (3, 9, 10, 11):
                if idx < len(fields):
                    fields[idx] = fields[idx].strip("'")
                    if fields[idx] == '':
                        fields[idx] = 'NULL'
            row = '(' + ', '.join(fields) + ')'
        cleaned.append(row)
    return ', '.join(cleaned)


def adapt_sql(sql: str) -> str:
    lines = sql.splitlines()

    output = []
    for line in lines:
        # Skip SQLite-specific statements
        if line.startswith("PRAGMA "):
            continue
        if line.startswith("BEGIN TRANSACTION"):
            continue
        if line.startswith("COMMIT"):
            continue
        if "sqlite_sequence" in line:
            continue

        # Replace AUTOINCREMENT if present
        line = line.replace("AUTOINCREMENT", "")

        # Replace backticks with double quotes
        line = line.replace("`", '"')

        # Quote reserved table name user
        line = re.sub(r"CREATE TABLE user", 'CREATE TABLE "user"', line)
        line = re.sub(r"INSERT INTO user", 'INSERT INTO "user"', line)

        # Replace BOOLEAN with BOOLEAN default true syntax is fine; ensure 0/1 -> false/true
        line = re.sub(r"(?i)\bTRUE\b", "TRUE", line)
        line = re.sub(r"(?i)\bFALSE\b", "FALSE", line)

        match = LESSON_INSERT_RE.match(line)
        if match:
            values_section = match.group(2)
            fixed = fix_lesson_values(values_section)
            if not fixed:
                continue
            line = f"{match.group(1)}{fixed}{match.group(3)}"

        output.append(line)

    return "\n".join(output)


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: convert_sqlite_to_postgres.py <input_dump.sql> <output.sql>")
        sys.exit(1)

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    if not src.exists():
        print(f"Input file {src} does not exist")
        sys.exit(1)

    converted = adapt_sql(src.read_text())
    dst.write_text(converted)

    print(f"Converted dump written to {dst}")


if __name__ == "__main__":
    main()


