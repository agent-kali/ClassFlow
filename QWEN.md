# QWEN.md — E-Home Schedule API
## Mission
FastAPI + SQLite + Pandas импорт расписаний E1/E2 → REST эндпоинты: /teachers, /classes, /my/{teacher_id}, /slots.
## Tech
Python 3.11, FastAPI, SQLAlchemy, pandas, openpyxl. DB: SQLite.
## Conventions
- Black/ruff; type hints strict.
- Commits: feat/fix/refactor/test + короткое описание.
## How to run
- dev: uvicorn app.main:app --reload
- tests: pytest -q
## What to improve first
- Надёжный импорт Excel (валидации, пропуски, дата/время).
- Нормализация таблиц (teachers/classes/rooms/timeslots).
- Индексы и фильтры /my/{teacher_id}?from=...&to=...
- Юнит-тесты для импорта и эндпоинтов.


