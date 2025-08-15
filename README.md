# E‑Home Schedule API

Internal tool to import E-Home school schedules into a queryable API for teachers and administrators.

Import class schedules from Excel into SQLite and expose a FastAPI service to query teacher/class timetables. Includes optional grouping of consecutive 30‑minute slots into longer sessions.

## Features

- Parse schedule data from Excel (`data/Schedule.xlsx`)
- Normalize lessons into 30‑minute slots and de‑duplicate
- Store data in SQLite (`data/schedule_test.db`)
- FastAPI endpoints to query by teacher or class
- Filters: week, day, campus; optional grouping of adjacent slots
- File upload endpoint for importing new schedules
- Room information parsing and display
- Comprehensive logging and error handling
- Helpful debug endpoints to list teachers and classes

## Project structure

- `inspect_schedule.py`: Importer script that reads the Excel file and writes clean tables to SQLite
- `main.py`: FastAPI app exposing schedule endpoints
- `data/Schedule.xlsx`: Source Excel (provide your file here)
- `data/schedule_test.db`: Generated SQLite database (created by the importer)

## Requirements

- Python 3.10+
- pip

Python packages:

```
fastapi
uvicorn
sqlalchemy
pandas
openpyxl
python-multipart  # For file uploads
```

## Setup

1) Create and activate a virtual environment (optional but recommended):

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
```

2) Install dependencies:

```bash
pip install -r requirements.txt
```

## Prepare the data

Place your Excel file at `data/Schedule.xlsx`.

If your sheet names differ, adjust `sheet_names` in `inspect_schedule.py`:

```python
sheet_names = ["E1 2025 final AUGUST ", "E2 2025 final AUGUST"]
```

Run the importer (this creates/overwrites `data/schedule_test.db`):

```bash
python inspect_schedule.py
```

## Run the API

Start the FastAPI server (creates helpful DB indexes on startup):

```bash
uvicorn main:app --reload
```

Open interactive docs:

- http://localhost:8000/docs

## API reference (summary)

All responses use the same shape for lesson entries:

```json
{
  "week": 1,
  "day": "Mon",
  "start_time": "09:00",
  "end_time": "09:30",
  "class_code": "E1-ABC",
  "teacher_name": "Mr Smith",
  "campus_name": "E1",
  "room": "A101",
  "duration_minutes": 30
}
```

### GET /my/{teacher_id}

Query a teacher's schedule.

Query params:

- `week` (int, optional)
- `day` (str, optional; e.g. Mon, Tue, ...)
- `campus` (str, optional; e.g. E1, E2)
- `grouped` (bool, optional; default false)

Example:

```bash
curl "http://localhost:8000/my/1?week=2&day=Mon&grouped=true"
```

### GET /class/{class_id}

Query a class's schedule.

Query params:

- `week` (int, optional)
- `day` (str, optional)
- `campus` (str, optional)
- `grouped` (bool, optional)

Example:

```bash
curl "http://localhost:8000/class/3?grouped=true"
```

### GET /teachers

List all teachers with IDs.

```bash
curl "http://localhost:8000/teachers"
```

### GET /classes

List all classes with IDs.

```bash
curl "http://localhost:8000/classes"
```

### POST /upload

Upload a new Excel schedule file for processing.

```bash
curl -F "file=@data/Schedule.xlsx" http://localhost:8000/upload
```

### GET /health

Health check endpoint.

```bash
curl "http://localhost:8000/health"
```

## Grouping logic

When `grouped=true`, consecutive 30‑minute slots are merged into a single session if they are contiguous in time and share the same campus, class, teacher, week and day.

## Troubleshooting

- 404 on queries: Make sure you ran `inspect_schedule.py` and the DB `data/schedule_test.db` exists.
- Empty results: Check `teacher_id`/`class_id` using `/teachers` and `/classes` endpoints.
- Excel format differences: Update `sheet_names` and adjust parsing heuristics in `inspect_schedule.py` as needed (week/day detection, time formats, etc.).
- Duplicate slots reported by the importer: The script logs diagnostics to help locate duplicates by content and position.
- Upload timeout: Large files may timeout after 5 minutes during background processing.
- Performance: The API includes optimized queries and proper indexing for fast responses.

## Frontend

The project includes a React + TypeScript frontend with Tailwind CSS.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 to access the teacher timeline interface.

## Notes

- The importer normalizes time ranges into 30‑minute slots with early duplicate prevention.
- The API creates useful indexes on `lesson` for faster filtering.
- Room information is automatically parsed from lesson cells when available.
- The database is overwritten each time you run the importer.
- All deprecation warnings have been fixed for SQLAlchemy 2.0 and Pydantic v2.
- Comprehensive logging provides detailed import progress and error reporting.

## License

## Performance Optimizations

- ✅ Eliminated duplicate lesson detection at parse time
- ✅ Database indexes on all query columns
- ✅ Unique constraints prevent data corruption
- ✅ Extracted common query logic to reduce code duplication
- ✅ Proper error handling and logging throughout
- ✅ File upload validation and size limits
- ✅ Background processing for import tasks

## License

MIT (or your preferred license)


