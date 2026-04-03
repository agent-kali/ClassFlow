.PHONY: install install-dev test run lint

install:
	pip install -r requirements.txt

install-dev: install
	pip install -r requirements-dev.txt

test:
	cd .. && python -m pytest backend/tests/ -v --tb=short

run:
	cd .. && uvicorn backend.app.main:app --reload

lint:
	python -m py_compile app/main.py
	python -m py_compile app/core/config.py
	python -m py_compile app/core/db.py
	python -m py_compile app/core/security.py
