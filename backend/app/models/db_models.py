"""SQLAlchemy ORM model definitions."""

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey, DateTime, Enum,
)

from backend.app.core.db import Base


class UserRole(PyEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    TEACHER = "teacher"


class Campus(Base):
    __tablename__ = "campus"
    campus_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)


class Teacher(Base):
    __tablename__ = "teacher"
    teacher_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    is_foreign = Column(Boolean)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    specialization = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)


class ClassModel(Base):
    __tablename__ = "class"
    class_id = Column(Integer, primary_key=True, index=True)
    campus_name = Column(String)
    code_old = Column(String)
    code_new = Column(String)
    name = Column(String)
    level = Column(String, nullable=True)
    capacity = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)


class Lesson(Base):
    __tablename__ = "lesson"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("class.class_id"))
    teacher_id = Column(Integer, ForeignKey("teacher.teacher_id"))
    co_teacher_id = Column(Integer, ForeignKey("teacher.teacher_id"), nullable=True)
    week = Column(Integer)
    day = Column(String)
    start_time = Column(String)
    end_time = Column(String)
    room = Column(String)
    month_week_id = Column(String)
    month = Column(Integer)
    year = Column(Integer)
    week_number = Column(Integer)


class User(Base):
    __tablename__ = "user"
    user_id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.TEACHER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    teacher_id = Column(Integer, ForeignKey("teacher.teacher_id"), nullable=True)


class ImportLog(Base):
    __tablename__ = "import_log"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | processing | completed | failed
    rows_imported = Column(Integer, default=0)
    error_message = Column(String, nullable=True)
    triggered_by = Column(Integer, ForeignKey("user.user_id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
