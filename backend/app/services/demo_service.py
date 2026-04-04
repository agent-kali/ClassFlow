"""Demo account provisioning and sample data generation.

Provides a shared demo dataset (teachers, classes, lessons) that persists
until explicitly reset.  All demo records use recognisable prefixes so they
can be safely identified and rebuilt without touching real data.

Prefixes / markers:
  - Demo user username: ``demo_manager``
  - Teacher names: ``[Demo] …``
  - Class codes:    ``DEMO-…``
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from backend.app.core.security import hash_password
from backend.app.models.db_models import (
    ClassModel, Lesson, Teacher, User, UserRole,
)

logger = logging.getLogger(__name__)

DEMO_USERNAME = "demo_manager"
DEMO_EMAIL = "demo@classflow.local"
DEMO_TEACHER_PREFIX = "[Demo] "
DEMO_CLASS_PREFIX = "DEMO-"

# ── Static seed data ─────────────────────────────────────────────────

_TEACHERS = [
    {"name": "Sarah Johnson", "specialization": "English", "email": "sarah@demo.local"},
    {"name": "Michael Chen", "specialization": "Mathematics", "email": "michael@demo.local"},
    {"name": "Emma Wilson", "specialization": "Science", "email": "emma@demo.local"},
    {"name": "David Park", "specialization": "History", "email": "david@demo.local"},
    {"name": "Lisa Thompson", "specialization": "Art", "email": "lisa@demo.local"},
]

_CLASSES = [
    {"code": "E1-A1", "campus": "E1", "level": "Beginner"},
    {"code": "E1-B2", "campus": "E1", "level": "Intermediate"},
    {"code": "E2-C1", "campus": "E2", "level": "Advanced"},
    {"code": "E2-D3", "campus": "E2", "level": "Intermediate"},
]

_LESSONS = [
    # Monday lessons
    {"teacher_idx": 0, "class_idx": 0, "day": "Monday",    "start": "17:00", "end": "17:30", "room": "101"},
    {"teacher_idx": 0, "class_idx": 0, "day": "Monday",    "start": "17:30", "end": "18:00", "room": "101"},
    {"teacher_idx": 1, "class_idx": 1, "day": "Monday",    "start": "17:00", "end": "17:30", "room": "102"},
    {"teacher_idx": 1, "class_idx": 1, "day": "Monday",    "start": "17:30", "end": "18:00", "room": "102"},
    {"teacher_idx": 2, "class_idx": 2, "day": "Monday",    "start": "18:00", "end": "18:30", "room": "201"},
    {"teacher_idx": 2, "class_idx": 2, "day": "Monday",    "start": "18:30", "end": "19:00", "room": "201"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Monday",    "start": "19:00", "end": "19:30", "room": "202"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Monday",    "start": "19:30", "end": "20:00", "room": "202"},
    # Wednesday lessons
    {"teacher_idx": 0, "class_idx": 1, "day": "Wednesday", "start": "17:00", "end": "17:30", "room": "101"},
    {"teacher_idx": 0, "class_idx": 1, "day": "Wednesday", "start": "17:30", "end": "18:00", "room": "101"},
    {"teacher_idx": 1, "class_idx": 2, "day": "Wednesday", "start": "18:00", "end": "18:30", "room": "103"},
    {"teacher_idx": 1, "class_idx": 2, "day": "Wednesday", "start": "18:30", "end": "19:00", "room": "103"},
    {"teacher_idx": 4, "class_idx": 0, "day": "Wednesday", "start": "17:00", "end": "17:30", "room": "201"},
    {"teacher_idx": 4, "class_idx": 0, "day": "Wednesday", "start": "17:30", "end": "18:00", "room": "201"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Wednesday", "start": "19:00", "end": "19:30", "room": "202"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Wednesday", "start": "19:30", "end": "20:00", "room": "202"},
]


# ── Public API ────────────────────────────────────────────────────────

def get_or_create_demo_user(db: Session) -> User:
    """Return the stable demo manager user, creating it if absent."""
    user = db.query(User).filter(User.username == DEMO_USERNAME).first()
    if user:
        return user

    import secrets
    user = User(
        username=DEMO_USERNAME,
        email=DEMO_EMAIL,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        role=UserRole.MANAGER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created demo user: %s (id=%s)", user.username, user.user_id)
    return user


def ensure_demo_data(db: Session) -> None:
    """Populate shared demo teachers, classes, and lessons if missing.

    Skips generation when demo teachers already exist so the dataset is
    stable across repeated logins.
    """
    existing = db.query(Teacher).filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")).count()
    if existing > 0:
        return
    _seed_demo_data(db)


def reset_demo_data(db: Session) -> dict:
    """Delete all demo records and regenerate a fresh dataset."""
    counts = _delete_demo_records(db)
    _seed_demo_data(db)
    return counts


# ── Internal helpers ──────────────────────────────────────────────────

def _current_week_context() -> dict:
    """Derive month/year/week_number for seeded lessons."""
    now = datetime.now()
    day_of_month = now.day
    week_number = (day_of_month - 1) // 7 + 1
    return {"month": now.month, "year": now.year, "week_number": week_number, "week": week_number}


def _seed_demo_data(db: Session) -> None:
    """Insert demo teachers, classes, and lessons."""
    ctx = _current_week_context()

    teacher_ids: list[int] = []
    for t in _TEACHERS:
        teacher = Teacher(
            name=f"{DEMO_TEACHER_PREFIX}{t['name']}",
            specialization=t["specialization"],
            email=t["email"],
            is_active=True,
            is_foreign=False,
        )
        db.add(teacher)
        db.flush()
        teacher_ids.append(teacher.teacher_id)

    class_ids: list[int] = []
    for c in _CLASSES:
        cls = ClassModel(
            code_new=f"{DEMO_CLASS_PREFIX}{c['code']}",
            code_old=f"{DEMO_CLASS_PREFIX}{c['code']}",
            name=f"{DEMO_CLASS_PREFIX}{c['code']}",
            campus_name=c["campus"],
            level=c["level"],
            is_active=True,
        )
        db.add(cls)
        db.flush()
        class_ids.append(cls.class_id)

    for ldata in _LESSONS:
        lesson = Lesson(
            teacher_id=teacher_ids[ldata["teacher_idx"]],
            class_id=class_ids[ldata["class_idx"]],
            day=ldata["day"],
            start_time=ldata["start"],
            end_time=ldata["end"],
            room=ldata["room"],
            week=ctx["week"],
            month=ctx["month"],
            year=ctx["year"],
            week_number=ctx["week_number"],
        )
        db.add(lesson)

    db.commit()
    logger.info(
        "Seeded demo data: %d teachers, %d classes, %d lessons",
        len(teacher_ids), len(class_ids), len(_LESSONS),
    )


def _delete_demo_records(db: Session) -> dict:
    """Remove all demo-prefixed records and return deletion counts."""
    demo_teacher_ids = [
        t.teacher_id
        for t in db.query(Teacher).filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")).all()
    ]
    demo_class_ids = [
        c.class_id
        for c in db.query(ClassModel).filter(ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%")).all()
    ]

    lessons_deleted = 0
    if demo_teacher_ids or demo_class_ids:
        from sqlalchemy import or_
        q = db.query(Lesson)
        conditions = []
        if demo_teacher_ids:
            conditions.append(Lesson.teacher_id.in_(demo_teacher_ids))
        if demo_class_ids:
            conditions.append(Lesson.class_id.in_(demo_class_ids))
        lessons_deleted = q.filter(or_(*conditions)).delete(synchronize_session="fetch")

    teachers_deleted = (
        db.query(Teacher)
        .filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%"))
        .delete(synchronize_session="fetch")
    )
    classes_deleted = (
        db.query(ClassModel)
        .filter(ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%"))
        .delete(synchronize_session="fetch")
    )

    db.query(User).filter(User.username == DEMO_USERNAME).delete(synchronize_session="fetch")

    db.commit()
    return {
        "teachers_deleted": teachers_deleted,
        "classes_deleted": classes_deleted,
        "lessons_deleted": lessons_deleted,
    }
