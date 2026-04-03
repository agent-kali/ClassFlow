"""Admin routes: POST /upload, GET /admin/import-status/{job_id}, GET /admin/import-history."""

import logging
import os
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.db import get_db
from backend.app.core.security import get_current_user, require_admin
from backend.app.models.db_models import ImportLog, User
from backend.app.models.schemas import ImportLogOut
from backend.app.services.importer import (
    backup_database, build_tables, check_production_import_guard, save_to_database,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",  # some browsers send this
}


def _run_import(job_id: str, file_path: str, db_url: str) -> None:
    """Background task: parse Excel and write to DB."""
    from backend.app.core.db import SessionLocal

    db = SessionLocal()
    try:
        log = db.query(ImportLog).filter(ImportLog.job_id == job_id).first()
        if log:
            log.status = "processing"
            db.commit()

        campuses_df, teachers_df, classes_df, lessons_df = build_tables(file_path)
        rows = save_to_database(campuses_df, teachers_df, classes_df, lessons_df, db_url)

        if log:
            log.status = "completed"
            log.rows_imported = rows
            log.completed_at = datetime.utcnow()
            db.commit()
    except Exception as e:
        logger.error("Import failed for job %s: %s", job_id, e)
        try:
            log = db.query(ImportLog).filter(ImportLog.job_id == job_id).first()
            if log:
                log.status = "failed"
                log.error_message = str(e)[:500]
                log.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/upload", summary="Upload Excel schedule", description="Upload and process an Excel schedule file. Requires admin role.")
async def upload_schedule(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Production guard
    check_production_import_guard()

    # Validate extension
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File must be Excel format ({', '.join(ALLOWED_EXTENSIONS)})")

    # Validate MIME type
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Invalid file type: {file.content_type}")

    # Read and check size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Max size: {settings.MAX_FILE_SIZE // 1024 // 1024}MB")

    # Create backup before destructive import
    backup_database()

    # Save file
    os.makedirs("data", exist_ok=True)
    dest = os.path.join("data", "Schedule.xlsx")
    with open(dest, "wb") as f:
        f.write(content)

    # Create import log
    job_id = str(uuid.uuid4())
    log = ImportLog(
        job_id=job_id,
        filename=file.filename,
        status="pending",
        triggered_by=current_user.user_id,
    )
    db.add(log)
    db.commit()

    # Run import in background
    background_tasks.add_task(_run_import, job_id, dest, settings.DATABASE_URL)

    return {"status": "queued", "job_id": job_id, "message": "Import started in background"}


@router.get("/admin/import-status/{job_id}", response_model=ImportLogOut, summary="Import job status")
def get_import_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    log = db.query(ImportLog).filter(ImportLog.job_id == job_id).first()
    if not log:
        raise HTTPException(404, "Import job not found")
    return log


@router.get("/admin/import-history", response_model=List[ImportLogOut], summary="Import history")
def get_import_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(ImportLog).order_by(ImportLog.started_at.desc()).limit(50).all()
