"""Schedule routes: GET /my/{id}, /class/{id}, /teachers, /classes and related endpoints."""

import logging
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, aliased

from backend.app.core.db import get_db
from backend.app.core.security import (
    get_current_user, require_admin, require_any_role, require_manager_or_admin,
)
from backend.app.models.db_models import (
    Campus, ClassModel, Lesson, Teacher, User,
)
from backend.app.models.schemas import (
    AnchorOut, ClassCreate, ClassOut, ClassUpdate, ConflictCheck,
    LessonCreate, LessonOut, LessonUpdate, TeacherCreate, TeacherOut,
    TeacherUpdate,
)
from backend.app.services.schedule_service import (
    build_lessons_from_rows, deduplicate_lessons, get_current_month_week,
    get_week_display_name, get_weeks_for_month, group_consecutive_lessons,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal helpers ─────────────────────────────────────────────────

def _get_schedule_rows(
    db: Session,
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    week_number: Optional[int] = None,
):
    CoTeacher = aliased(Teacher)
    query = (
        db.query(Lesson, ClassModel, Teacher, CoTeacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .outerjoin(CoTeacher, Lesson.co_teacher_id == CoTeacher.teacher_id)
    )
    if teacher_id is not None:
        query = query.filter(or_(Lesson.teacher_id == teacher_id, Lesson.co_teacher_id == teacher_id))
    if class_id is not None:
        query = query.filter(Lesson.class_id == class_id)
    if campus is not None:
        query = query.filter(ClassModel.campus_name == campus)
    if month is not None and year is not None and week_number is not None:
        query = query.filter(Lesson.month == month, Lesson.year == year, Lesson.week_number == week_number)
    elif week is not None:
        query = query.filter(Lesson.week == week)
    if day is not None:
        query = query.filter(Lesson.day == day)
    return query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()


def check_lesson_conflicts(
    db: Session, lesson_data: LessonCreate, exclude_lesson_id: Optional[int] = None,
) -> List[str]:
    conflicts: List[str] = []
    teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.teacher_id).first()
    class_info = db.query(ClassModel).filter(ClassModel.class_id == lesson_data.class_id).first()
    if not teacher:
        conflicts.append(f"Teacher with ID {lesson_data.teacher_id} not found")
        return conflicts
    if not class_info:
        conflicts.append(f"Class with ID {lesson_data.class_id} not found")
        return conflicts

    conflict_query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.day == lesson_data.day)
    )
    if lesson_data.week is not None:
        conflict_query = conflict_query.filter(Lesson.week == lesson_data.week)
    elif lesson_data.month is not None and lesson_data.year is not None and lesson_data.week_number is not None:
        conflict_query = conflict_query.filter(
            Lesson.month == lesson_data.month,
            Lesson.year == lesson_data.year,
            Lesson.week_number == lesson_data.week_number,
        )
    if exclude_lesson_id:
        conflict_query = conflict_query.filter(Lesson.id != exclude_lesson_id)
    existing_lessons = conflict_query.all()

    for lesson, cls, existing_teacher in existing_lessons:
        if lesson is None:
            continue
        if lesson.start_time < lesson_data.end_time and lesson.end_time > lesson_data.start_time:
            if lesson.teacher_id == lesson_data.teacher_id:
                conflicts.append(
                    f"Teacher {teacher.name} is already scheduled for {cls.code_new or cls.code_old} "
                    f"from {lesson.start_time} to {lesson.end_time}"
                )
            if lesson_data.co_teacher_id and lesson.teacher_id == lesson_data.co_teacher_id:
                co_teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.co_teacher_id).first()
                if co_teacher:
                    conflicts.append(
                        f"Co-teacher {co_teacher.name} is already scheduled as primary teacher for "
                        f"{cls.code_new or cls.code_old} from {lesson.start_time} to {lesson.end_time}"
                    )
            if lesson.co_teacher_id == lesson_data.teacher_id:
                conflicts.append(
                    f"Teacher {teacher.name} is already scheduled as co-teacher for "
                    f"{cls.code_new or cls.code_old} from {lesson.start_time} to {lesson.end_time}"
                )
            if lesson_data.co_teacher_id and lesson.co_teacher_id and lesson.co_teacher_id == lesson_data.co_teacher_id:
                co_teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.co_teacher_id).first()
                if co_teacher:
                    conflicts.append(
                        f"Co-teacher {co_teacher.name} is already scheduled for "
                        f"{cls.code_new or cls.code_old} from {lesson.start_time} to {lesson.end_time}"
                    )
            if lesson_data.room and lesson.room and lesson.room == lesson_data.room:
                conflicts.append(
                    f"Room {lesson_data.room} is already booked for {existing_teacher.name} "
                    f"({cls.code_new or cls.code_old}) from {lesson.start_time} to {lesson.end_time}"
                )

    if conflicts and lesson_data.co_teacher_id and not any(
        msg.startswith("Teacher ") or msg.startswith("Room ") for msg in conflicts
    ):
        conflicts = []
    return conflicts


def validate_lesson_times(start_time: str, end_time: str) -> None:
    if start_time < "17:00" or start_time > "20:30":
        raise HTTPException(400, f"Start time must be between 17:00 and 20:30, got {start_time}")
    if end_time < "17:00" or end_time > "20:30":
        raise HTTPException(400, f"End time must be between 17:00 and 20:30, got {end_time}")
    if start_time >= end_time:
        raise HTTPException(400, "End time must be after start time")


# ── Calendar ─────────────────────────────────────────────────────────

@router.get("/calendar/anchor", response_model=AnchorOut, summary="Calendar anchor date")
def get_calendar_anchor(db: Session = Depends(get_db)) -> AnchorOut:
    from datetime import datetime, timedelta

    anchor_candidate = None
    try:
        row = db.execute(text(
            "SELECT year, month, week_number FROM lesson "
            "WHERE year IS NOT NULL AND month IS NOT NULL AND week_number IS NOT NULL "
            "ORDER BY year ASC, month ASC, week_number ASC LIMIT 1"
        )).mappings().first()
        if row:
            anchor_candidate = datetime(int(row["year"]), int(row["month"]), 1)
            while anchor_candidate.weekday() != 0:
                anchor_candidate += timedelta(days=1)
    except Exception:
        anchor_candidate = None

    if anchor_candidate is None:
        from datetime import datetime, timedelta
        try:
            row = db.execute(text("SELECT MIN(week) AS min_week FROM lesson")).fetchone()
            min_week = int(row.min_week) if row and row.min_week is not None else None
        except Exception:
            min_week = None
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        if min_week is None or min_week < 1:
            anchor_candidate = monday
        else:
            anchor_candidate = monday - timedelta(days=(min_week - 1) * 7)

    anchor = anchor_candidate.replace(hour=0, minute=0, second=0, microsecond=0)
    return AnchorOut(anchor_date=anchor.strftime("%Y-%m-%d"))


@router.get("/weeks/{year}/{month}", summary="Get weeks for a month")
def get_weeks_for_month_endpoint(year: int, month: int, current_user: User = Depends(require_any_role)):
    try:
        weeks = get_weeks_for_month(year, month)
        return [
            {"week_number": wn, "start_date": sd.strftime("%Y-%m-%d"), "end_date": ed.strftime("%Y-%m-%d"), "display_name": get_week_display_name(year, month, wn)}
            for wn, sd, ed in weeks
        ]
    except Exception as e:
        raise HTTPException(400, f"Invalid month/year: {e}")


@router.get("/current-month-week", summary="Current month and week")
def get_current_month_week_endpoint(current_user: User = Depends(require_any_role)):
    year, month, week_number = get_current_month_week()
    return {"year": year, "month": month, "week_number": week_number, "display_name": get_week_display_name(year, month, week_number)}


# ── Health ───────────────────────────────────────────────────────────

@router.get("/health", summary="Health check")
def health_check():
    from datetime import datetime
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# ── Teacher schedule ─────────────────────────────────────────────────

@router.get("/my/{teacher_id}", response_model=List[LessonOut], summary="Teacher schedule")
def get_teacher_schedule(
    teacher_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    month: Optional[int] = None,
    year: Optional[int] = None,
    week_number: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[LessonOut]:
    # Own schedule only (admin sees all)
    from backend.app.models.db_models import UserRole
    if current_user.role != UserRole.ADMIN and current_user.teacher_id != teacher_id:
        raise HTTPException(403, "You can only view your own schedule")

    teacher_exists = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher_exists:
        raise HTTPException(404, f"Teacher with id {teacher_id} not found")

    rows = _get_schedule_rows(db, teacher_id=teacher_id, week=week, day=day, campus=campus, month=month, year=year, week_number=week_number)
    if not rows:
        return []

    keys = [
        (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        for lesson, cls, _, _ in rows if lesson is not None and cls is not None
    ]
    co_map: Dict[Tuple[int, int, str, str, str], List[str]] = {}
    if keys:
        class_ids = {k[0] for k in keys}
        weeks_set = {k[1] for k in keys}
        days_set = {k[2] for k in keys}
        starts = {k[3] for k in keys}
        ends = {k[4] for k in keys}
        others = (
            db.query(Lesson, ClassModel, Teacher)
            .join(ClassModel, Lesson.class_id == ClassModel.class_id)
            .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
            .filter(Lesson.class_id.in_(class_ids), Lesson.week.in_(weeks_set), Lesson.day.in_(days_set),
                    Lesson.start_time.in_(starts), Lesson.end_time.in_(ends))
            .all()
        )
        selected_is_foreign = bool(teacher_exists.is_foreign)
        for l, c, t in others:
            if l is None or c is None or t is None:
                continue
            k = (c.class_id, l.week, l.day, l.start_time, l.end_time)
            candidate_is_foreign = bool(getattr(t, "is_foreign", False))
            if selected_is_foreign and not candidate_is_foreign:
                co_map.setdefault(k, []).append(t.name)
            elif not selected_is_foreign and candidate_is_foreign:
                co_map.setdefault(k, []).append(t.name)
        by_key_all: Dict[Tuple[int, int, str, str, str], List[str]] = {}
        for l, c, t in others:
            if l is None or c is None or t is None:
                continue
            k = (c.class_id, l.week, l.day, l.start_time, l.end_time)
            by_key_all.setdefault(k, []).append(t.name)
        for k, all_names in by_key_all.items():
            if not co_map.get(k):
                co_map[k] = all_names

    lessons = build_lessons_from_rows(rows, co_map=co_map, exclude_teacher=teacher_exists.name, viewing_teacher_id=teacher_id)
    for lesson in lessons:
        if getattr(lesson, "week", None) is None and getattr(lesson, "week_number", None) is not None:
            lesson.week = lesson.week_number

    if not grouped:
        merged: Dict[tuple, LessonOut] = {}
        for l in lessons:
            key = (l.week, l.day, l.start_time, l.end_time, l.class_code, l.teacher_name, l.campus_name)
            if key not in merged:
                merged[key] = l
            else:
                base = merged[key]
                base_co = list(base.co_teachers or [])
                if l.co_teachers:
                    for name in l.co_teachers:
                        if name not in base_co:
                            base_co.append(name)
                base.co_teachers = base_co or None
        return list(merged.values())

    unique_lessons = deduplicate_lessons(lessons)
    return group_consecutive_lessons(unique_lessons)


@router.get("/class/{class_id}", response_model=List[LessonOut], summary="Class schedule")
def get_class_schedule(
    class_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[LessonOut]:
    class_exists = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    if not class_exists:
        raise HTTPException(404, f"Class with id {class_id} not found")
    rows = _get_schedule_rows(db, class_id=class_id, week=week, day=day, campus=campus)
    if not rows:
        return []
    lessons = build_lessons_from_rows(rows)
    unique_lessons = deduplicate_lessons(lessons)
    return group_consecutive_lessons(unique_lessons) if grouped else unique_lessons


# ── Teachers CRUD ────────────────────────────────────────────────────

@router.get("/teachers", response_model=List[TeacherOut], summary="List teachers")
def list_teachers(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
):
    query = db.query(Teacher)
    if search:
        query = query.filter(Teacher.name.ilike(f"%{search}%"))
    if is_active is not None:
        query = query.filter(Teacher.is_active == is_active)
    teachers = query.all()
    result = []
    for teacher in teachers:
        if teacher is None:
            continue
        lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher.teacher_id).count()
        result.append(TeacherOut(
            teacher_id=teacher.teacher_id, name=teacher.name,
            email=getattr(teacher, "email", None), phone=getattr(teacher, "phone", None),
            specialization=getattr(teacher, "specialization", None),
            is_active=teacher.is_active, lesson_count=lesson_count,
        ))
    return result


@router.post("/teachers", response_model=TeacherOut, summary="Create teacher")
def create_teacher(teacher_data: TeacherCreate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    existing = db.query(Teacher).filter(Teacher.name == teacher_data.name).first()
    if existing:
        raise HTTPException(400, "Teacher with this name already exists")
    teacher = Teacher(name=teacher_data.name, email=teacher_data.email, phone=teacher_data.phone,
                      specialization=teacher_data.specialization, is_active=teacher_data.is_active, is_foreign=False)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return TeacherOut(teacher_id=teacher.teacher_id, name=teacher.name, email=teacher.email,
                      phone=teacher.phone, specialization=teacher.specialization, is_active=teacher.is_active, lesson_count=0)


@router.get("/teachers/{teacher_id}", response_model=TeacherOut, summary="Get teacher")
def get_teacher(teacher_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_any_role)):
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    return TeacherOut(teacher_id=teacher.teacher_id, name=teacher.name, email=teacher.email,
                      phone=teacher.phone, specialization=teacher.specialization, is_active=teacher.is_active, lesson_count=lesson_count)


@router.put("/teachers/{teacher_id}", response_model=TeacherOut, summary="Update teacher")
def update_teacher(teacher_id: int, teacher_data: TeacherUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    if teacher_data.name and teacher_data.name != teacher.name:
        existing = db.query(Teacher).filter(Teacher.name == teacher_data.name).first()
        if existing:
            raise HTTPException(400, "Teacher with this name already exists")
    for field, value in teacher_data.model_dump(exclude_unset=True).items():
        setattr(teacher, field, value)
    db.commit()
    db.refresh(teacher)
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    return TeacherOut(teacher_id=teacher.teacher_id, name=teacher.name, email=teacher.email,
                      phone=teacher.phone, specialization=teacher.specialization, is_active=teacher.is_active, lesson_count=lesson_count)


@router.delete("/teachers/{teacher_id}", summary="Delete teacher")
def delete_teacher(teacher_id: int, force: bool = False, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    if lesson_count > 0 and not force:
        raise HTTPException(400, f"Cannot delete teacher with {lesson_count} assigned lessons. Use force=true to override.")
    if lesson_count > 0 and force:
        teacher.is_active = False
        db.commit()
        return {"message": f"Teacher deactivated (had {lesson_count} lessons)"}
    db.delete(teacher)
    db.commit()
    return {"message": "Teacher deleted successfully"}


# ── Classes CRUD ─────────────────────────────────────────────────────

@router.get("/classes", response_model=List[ClassOut], summary="List classes")
def list_classes(
    search: Optional[str] = None, campus: Optional[str] = None,
    is_active: Optional[bool] = None, db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
):
    query = db.query(ClassModel)
    if search:
        query = query.filter(or_(ClassModel.code_new.ilike(f"%{search}%"), ClassModel.code_old.ilike(f"%{search}%"), ClassModel.name.ilike(f"%{search}%")))
    if campus:
        query = query.filter(ClassModel.campus_name.ilike(f"%{campus}%"))
    if is_active is not None:
        query = query.filter(ClassModel.is_active == is_active)
    classes = query.all()
    result = []
    for cls in classes:
        if cls is None:
            continue
        lesson_count = db.query(Lesson).filter(Lesson.class_id == cls.class_id).count()
        result.append(ClassOut(
            class_id=cls.class_id, code_new=cls.code_new, code_old=cls.code_old,
            campus_name=cls.campus_name if cls.campus_name else "",
            level=str(cls.level) if cls.level else None, capacity=cls.capacity,
            is_active=cls.is_active, lesson_count=lesson_count,
        ))
    return result


@router.post("/classes", response_model=ClassOut, summary="Create class")
def create_class(class_data: ClassCreate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    if class_data.code_new:
        if db.query(ClassModel).filter(ClassModel.code_new == class_data.code_new).first():
            raise HTTPException(400, "Class with this new code already exists")
    if class_data.code_old:
        if db.query(ClassModel).filter(ClassModel.code_old == class_data.code_old).first():
            raise HTTPException(400, "Class with this old code already exists")
    cls = ClassModel(code_new=class_data.code_new, code_old=class_data.code_old, campus_name=class_data.campus_name,
                     level=class_data.level, capacity=class_data.capacity, is_active=class_data.is_active,
                     name=class_data.code_new or class_data.code_old or f"Class {class_data.campus_name}")
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return ClassOut(class_id=cls.class_id, code_new=cls.code_new, code_old=cls.code_old,
                    campus_name=cls.campus_name, level=cls.level, capacity=cls.capacity,
                    is_active=cls.is_active, lesson_count=0)


@router.get("/classes/{class_id}", response_model=ClassOut, summary="Get class")
def get_class(class_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_any_role)):
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    return ClassOut(class_id=cls.class_id, code_new=cls.code_new, code_old=cls.code_old,
                    campus_name=cls.campus_name, level=cls.level, capacity=cls.capacity,
                    is_active=cls.is_active, lesson_count=lesson_count)


@router.put("/classes/{class_id}", response_model=ClassOut, summary="Update class")
def update_class(class_id: int, class_data: ClassUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    if class_data.code_new and class_data.code_new != cls.code_new:
        if db.query(ClassModel).filter(ClassModel.code_new == class_data.code_new, ClassModel.class_id != class_id).first():
            raise HTTPException(400, "Class with this new code already exists")
    if class_data.code_old and class_data.code_old != cls.code_old:
        if db.query(ClassModel).filter(ClassModel.code_old == class_data.code_old, ClassModel.class_id != class_id).first():
            raise HTTPException(400, "Class with this old code already exists")
    for field, value in class_data.model_dump(exclude_unset=True).items():
        setattr(cls, field, value)
    if class_data.code_new or class_data.code_old:
        cls.name = cls.code_new or cls.code_old or cls.name
    db.commit()
    db.refresh(cls)
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    return ClassOut(class_id=cls.class_id, code_new=cls.code_new, code_old=cls.code_old,
                    campus_name=cls.campus_name, level=cls.level, capacity=cls.capacity,
                    is_active=cls.is_active, lesson_count=lesson_count)


@router.delete("/classes/{class_id}", summary="Delete class")
def delete_class(class_id: int, force: bool = False, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    if lesson_count > 0 and not force:
        raise HTTPException(400, f"Cannot delete class with {lesson_count} assigned lessons. Use force=true to override.")
    if lesson_count > 0 and force:
        cls.is_active = False
        db.commit()
        return {"message": f"Class deactivated (had {lesson_count} lessons)"}
    db.delete(cls)
    db.commit()
    return {"message": "Class deleted successfully"}


# ── Lesson CRUD ──────────────────────────────────────────────────────

@router.post("/lessons/check-conflicts", response_model=ConflictCheck, summary="Check lesson conflicts")
def check_conflicts(lesson_data: LessonCreate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    conflicts = check_lesson_conflicts(db, lesson_data)
    return ConflictCheck(conflicts=conflicts, can_create=len(conflicts) == 0)


@router.post("/lessons", response_model=LessonOut, summary="Create lesson")
def create_lesson(lesson_data: LessonCreate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    from sqlalchemy.exc import IntegrityError
    validate_lesson_times(lesson_data.start_time, lesson_data.end_time)
    conflicts = check_lesson_conflicts(db, lesson_data)
    if conflicts:
        raise HTTPException(400, f"Cannot create lesson due to conflicts: {'; '.join(conflicts)}")
    new_lesson = Lesson(
        teacher_id=lesson_data.teacher_id, co_teacher_id=lesson_data.co_teacher_id,
        class_id=lesson_data.class_id, week=(lesson_data.week if lesson_data.week is not None else lesson_data.week_number),
        day=lesson_data.day, start_time=lesson_data.start_time, end_time=lesson_data.end_time,
        room=lesson_data.room, month=lesson_data.month, year=lesson_data.year,
        week_number=lesson_data.week_number, month_week_id=lesson_data.week_number,
    )
    db.add(new_lesson)
    try:
        db.commit()
        try:
            db.refresh(new_lesson)
        except Exception:
            fallback = db.query(Lesson).filter(
                Lesson.class_id == new_lesson.class_id, Lesson.teacher_id == new_lesson.teacher_id,
                Lesson.day == new_lesson.day, Lesson.start_time == new_lesson.start_time,
            ).order_by(Lesson.id.desc()).first()
            if fallback is None:
                raise HTTPException(500, "Lesson saved but could not be reloaded.")
            new_lesson = fallback
    except IntegrityError as exc:
        db.rollback()
        detail_text = str(exc.orig) if getattr(exc, "orig", None) else str(exc)
        if "UNIQUE constraint failed" in detail_text:
            raise HTTPException(409, "Lesson already exists for this slot.")
        if "FOREIGN KEY constraint failed" in detail_text:
            raise HTTPException(400, "Invalid teacher or class selection.")
        raise HTTPException(500, "Unable to create lesson")
    row = db.query(Lesson, ClassModel, Teacher).join(ClassModel, Lesson.class_id == ClassModel.class_id).join(Teacher, Lesson.teacher_id == Teacher.teacher_id).filter(Lesson.id == new_lesson.id).first()
    if not row:
        raise HTTPException(500, "Failed to retrieve created lesson")
    lesson, cls, teacher = row
    mwd = get_week_display_name(lesson.year, lesson.month, lesson.week_number) if lesson.month and lesson.year and lesson.week_number else None
    return LessonOut(id=lesson.id, week=lesson.week, day=lesson.day, start_time=lesson.start_time, end_time=lesson.end_time,
                     class_code=cls.code_new or cls.code_old, teacher_name=teacher.name, campus_name=cls.campus_name,
                     room=lesson.room, duration_minutes=30, month=lesson.month, year=lesson.year, week_number=lesson.week_number, month_week_display=mwd)


@router.get("/lessons/{lesson_id}", response_model=LessonOut, summary="Get lesson by ID")
def get_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_any_role)):
    row = db.query(Lesson, ClassModel, Teacher).join(ClassModel, Lesson.class_id == ClassModel.class_id).join(Teacher, Lesson.teacher_id == Teacher.teacher_id).filter(Lesson.id == lesson_id).first()
    if not row:
        raise HTTPException(404, "Lesson not found")
    lesson, cls, teacher = row
    mwd = get_week_display_name(lesson.year, lesson.month, lesson.week_number) if lesson.month and lesson.year and lesson.week_number else None
    return LessonOut(id=lesson.id, week=lesson.week, day=lesson.day, start_time=lesson.start_time, end_time=lesson.end_time,
                     class_code=cls.code_new or cls.code_old, teacher_name=teacher.name, campus_name=cls.campus_name,
                     room=lesson.room, duration_minutes=30, month=lesson.month, year=lesson.year, week_number=lesson.week_number, month_week_display=mwd)


@router.get("/lessons", response_model=List[LessonOut], summary="List lessons")
def list_lessons(
    week: Optional[int] = None, day: Optional[str] = None,
    teacher_id: Optional[int] = None, class_id: Optional[int] = None,
    room: Optional[str] = None, month: Optional[int] = None,
    year: Optional[int] = None, week_number: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(require_any_role),
):
    query = db.query(Lesson, ClassModel, Teacher).join(ClassModel, Lesson.class_id == ClassModel.class_id).join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
    if month is not None and year is not None and week_number is not None:
        query = query.filter(Lesson.month == month, Lesson.year == year, Lesson.week_number == week_number)
    elif week is not None:
        query = query.filter(Lesson.week == week)
    if day is not None:
        query = query.filter(Lesson.day == day)
    if teacher_id is not None:
        query = query.filter(Lesson.teacher_id == teacher_id)
    if class_id is not None:
        query = query.filter(Lesson.class_id == class_id)
    if room is not None:
        query = query.filter(Lesson.room == room)
    rows = query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()
    result = []
    for lesson, cls, teacher in rows:
        if lesson is None or cls is None or teacher is None:
            continue
        mwd = get_week_display_name(lesson.year, lesson.month, lesson.week_number) if lesson.month and lesson.year and lesson.week_number else None
        result.append(LessonOut(id=lesson.id, week=lesson.week, day=lesson.day, start_time=lesson.start_time, end_time=lesson.end_time,
                                class_code=cls.code_new or cls.code_old, teacher_name=teacher.name, campus_name=cls.campus_name,
                                room=lesson.room, duration_minutes=30, month=lesson.month, year=lesson.year, week_number=lesson.week_number, month_week_display=mwd))
    return result


@router.put("/lessons/{lesson_id}", response_model=LessonOut, summary="Update lesson")
def update_lesson(lesson_id: int, lesson_update: LessonUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    existing_lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not existing_lesson:
        raise HTTPException(404, "Lesson not found")
    final_start = lesson_update.start_time or existing_lesson.start_time
    final_end = lesson_update.end_time or existing_lesson.end_time
    validate_lesson_times(final_start, final_end)
    ld = LessonCreate(
        teacher_id=lesson_update.teacher_id or existing_lesson.teacher_id,
        class_id=lesson_update.class_id or existing_lesson.class_id,
        week=lesson_update.week or existing_lesson.week,
        day=lesson_update.day or existing_lesson.day,
        start_time=final_start, end_time=final_end,
        room=lesson_update.room if lesson_update.room is not None else existing_lesson.room,
        month=lesson_update.month or existing_lesson.month,
        year=lesson_update.year or existing_lesson.year,
        week_number=lesson_update.week_number or existing_lesson.week_number,
    )
    conflicts = check_lesson_conflicts(db, ld, exclude_lesson_id=lesson_id)
    if conflicts:
        raise HTTPException(400, f"Cannot update lesson: {'; '.join(conflicts)}")
    for field in ("teacher_id", "class_id", "week", "day", "start_time", "end_time", "room", "month", "year", "week_number"):
        val = getattr(lesson_update, field, None)
        if val is not None:
            setattr(existing_lesson, field, val)
    db.commit()
    db.refresh(existing_lesson)
    row = db.query(Lesson, ClassModel, Teacher).join(ClassModel, Lesson.class_id == ClassModel.class_id).join(Teacher, Lesson.teacher_id == Teacher.teacher_id).filter(Lesson.id == lesson_id).first()
    lesson, cls, teacher = row
    return LessonOut(id=lesson.id, week=lesson.week, day=lesson.day, start_time=lesson.start_time, end_time=lesson.end_time,
                     class_code=cls.code_new or cls.code_old, teacher_name=teacher.name, campus_name=cls.campus_name,
                     room=lesson.room, duration_minutes=30)


@router.delete("/lessons/{lesson_id}", summary="Delete lesson")
def delete_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_admin)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    db.delete(lesson)
    db.commit()
    return {"message": "Lesson deleted successfully"}
