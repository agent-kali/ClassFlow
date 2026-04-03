"""Pydantic schemas for API request/response models."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr

from backend.app.models.db_models import UserRole


# ── Lesson ───────────────────────────────────────────────────────────

class LessonOut(BaseModel):
    id: Optional[int] = None
    week: Optional[int] = None
    day: str
    start_time: str
    end_time: str
    class_code: str
    teacher_name: str
    teacher_id: Optional[int] = None
    class_id: Optional[int] = None
    co_teacher_id: Optional[int] = None
    co_teacher_name: Optional[str] = None
    campus_name: str
    room: Optional[str] = None
    co_teachers: Optional[List[str]] = None
    duration_minutes: int
    notes: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    week_number: Optional[int] = None
    month_week_display: Optional[str] = None

    class Config:
        from_attributes = True


class LessonCreate(BaseModel):
    teacher_id: int
    co_teacher_id: Optional[int] = None
    class_id: int
    week: int
    day: str
    start_time: str
    end_time: str
    room: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    week_number: Optional[int] = None


class LessonUpdate(BaseModel):
    teacher_id: Optional[int] = None
    co_teacher_id: Optional[int] = None
    class_id: Optional[int] = None
    week: Optional[int] = None
    day: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    week_number: Optional[int] = None


class ConflictCheck(BaseModel):
    conflicts: List[str]
    can_create: bool


# ── Teacher ──────────────────────────────────────────────────────────

class TeacherCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    is_active: bool = True


class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None


class TeacherOut(BaseModel):
    teacher_id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    is_active: bool
    lesson_count: int = 0

    class Config:
        from_attributes = True


# ── Class ────────────────────────────────────────────────────────────

class ClassCreate(BaseModel):
    code_new: Optional[str] = None
    code_old: Optional[str] = None
    campus_name: str
    level: Optional[str] = None
    capacity: Optional[int] = None
    is_active: bool = True


class ClassUpdate(BaseModel):
    code_new: Optional[str] = None
    code_old: Optional[str] = None
    campus_name: Optional[str] = None
    level: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None


class ClassOut(BaseModel):
    class_id: int
    code_new: Optional[str] = None
    code_old: Optional[str] = None
    campus_name: str
    level: Optional[str] = None
    capacity: Optional[int] = None
    is_active: bool
    lesson_count: int = 0

    class Config:
        from_attributes = True


# ── Auth / User ──────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.TEACHER
    teacher_id: Optional[int] = None


class UserOut(BaseModel):
    user_id: int
    username: str
    email: str
    role: UserRole
    is_active: bool
    teacher_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Calendar ─────────────────────────────────────────────────────────

class AnchorOut(BaseModel):
    anchor_date: str


# ── Import log ───────────────────────────────────────────────────────

class ImportLogOut(BaseModel):
    job_id: str
    filename: str
    status: str
    rows_imported: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
