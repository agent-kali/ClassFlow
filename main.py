from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, text, DateTime, Enum, or_, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import os
import subprocess
import logging
import hashlib
import jwt
from passlib.context import CryptContext
from enum import Enum as PyEnum
import calendar

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Month-based week utility functions
def get_first_monday_of_month(year: int, month: int) -> datetime:
    """Get the first Monday of a given month"""
    first_day = datetime(year, month, 1)
    days_ahead = 0 - first_day.weekday()  # Monday is 0
    if days_ahead <= 0:  # Target day already happened this week
        days_ahead += 7
    return first_day + timedelta(days=days_ahead)

def get_weeks_for_month(year: int, month: int) -> List[Tuple[int, datetime, datetime]]:
    """Get all weeks for a given month, each starting on Monday"""
    weeks = []
    first_monday = get_first_monday_of_month(year, month)
    
    week_num = 1
    current_monday = first_monday
    
    while current_monday.month == month or (current_monday.month == month % 12 + 1 and current_monday.day <= 7):
        week_end = current_monday + timedelta(days=6)  # Sunday
        weeks.append((week_num, current_monday, week_end))
        
        current_monday += timedelta(days=7)
        week_num += 1
        
        # Stop if we've gone too far into the next month
        if current_monday.month != month and current_monday.day > 7:
            break
    
    return weeks

def get_week_display_name(year: int, month: int, week_number: int) -> str:
    """Generate display name like 'Week 1 (Sep 2-8)'"""
    month_name = calendar.month_abbr[month]
    weeks = get_weeks_for_month(year, month)
    
    if week_number <= len(weeks):
        _, start_date, end_date = weeks[week_number - 1]
        return f"Week {week_number} ({month_name} {start_date.day}-{end_date.day})"
    
    return f"Week {week_number}"

def get_current_month_week() -> Tuple[int, int, int]:
    """Get current year, month, and week number"""
    now = datetime.now()
    year = now.year
    month = now.month
    
    # Find which week of the month we're in
    weeks = get_weeks_for_month(year, month)
    for week_num, start_date, end_date in weeks:
        if start_date <= now <= end_date:
            return year, month, week_num
    
    # Fallback to first week
    return year, month, 1

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/schedule_test.db")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if ENVIRONMENT in {"development", "dev", "local", "test", "testing"}:
        JWT_SECRET_KEY = "dev-only-secret-change-me"
        logger.warning("JWT secret not set; using development-only fallback. Never use this in production.")
    else:
        raise RuntimeError("JWT_SECRET_KEY environment variable must be set in production environments.")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours

# Allow local dev ports and optionally extra origins via env (comma-separated)
_extra_origins_env = os.getenv("CORS_EXTRA_ORIGINS", "").strip()
_extra_origins = [o.strip() for o in _extra_origins_env.split(",") if o.strip()]
CORS_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5176", "http://127.0.0.1:5176",
    "http://localhost:5177", "http://127.0.0.1:5177",
    "http://localhost:5178", "http://127.0.0.1:5178",
    "http://localhost:5179", "http://127.0.0.1:5179",
    "http://localhost:5180", "http://127.0.0.1:5180",
] + _extra_origins
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Role-based access control
class UserRole(PyEnum):
    ADMIN = "admin"
    MANAGER = "manager" 
    TEACHER = "teacher"

# ORM models with actual column names
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
    campus_name = Column(String)       # from import, if needed
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
    # Month-based week fields
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
    teacher_id = Column(Integer, ForeignKey("teacher.teacher_id"), nullable=True)  # Link to teacher if applicable

# Pydantic models
class LessonOut(BaseModel):
    id: Optional[int] = None  # Add lesson ID for CRUD operations
    week: Optional[int] = None
    day: str
    start_time: str
    end_time: str
    class_code: str
    teacher_name: str
    teacher_id: Optional[int] = None  # Add teacher ID for editing
    class_id: Optional[int] = None   # Add class ID for editing
    co_teacher_id: Optional[int] = None
    co_teacher_name: Optional[str] = None
    campus_name: str
    room: Optional[str] = None
    co_teachers: Optional[List[str]] = None
    duration_minutes: int  # Added for convenience
    notes: Optional[str] = None  # Add notes field
    # Month-based week fields
    month: Optional[int] = None
    year: Optional[int] = None
    week_number: Optional[int] = None
    month_week_display: Optional[str] = None

    class Config:
        from_attributes = True

# Teacher Management Models
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
    lesson_count: int = 0  # Number of lessons assigned

    class Config:
        from_attributes = True

# Class Management Models
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
    lesson_count: int = 0  # Number of lessons assigned

    class Config:
        from_attributes = True

# Authentication Pydantic models
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

# Lesson management Pydantic models
class LessonCreate(BaseModel):
    teacher_id: int
    co_teacher_id: Optional[int] = None
    class_id: int
    week: int
    day: str
    start_time: str
    end_time: str
    room: Optional[str] = None
    # Month-based week fields
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
    # Month-based week fields
    month: Optional[int] = None
    year: Optional[int] = None
    week_number: Optional[int] = None

class ConflictCheck(BaseModel):
    conflicts: List[str]
    can_create: bool

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_indexes()
    yield
    # Shutdown (if needed)

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Allow Render hosted frontends and tunnels
    allow_origin_regex=r"(http://(localhost|127\.0\.0\.1):517\d|https://.*\.loca\.lt|https://.*\.onrender\.com)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Authentication utilities
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__default_rounds=12)


def _is_legacy_hash(hash_value: str) -> bool:
    return ":" in (hash_value or "")


def _verify_legacy_password(password: str, hashed: str) -> bool:
    try:
        hash_part, salt = hashed.split(":", 1)
        return hashlib.sha256((password + salt).encode()).hexdigest() == hash_part
    except ValueError:
        return False


def hash_password(password: str) -> str:
    """Hash password using bcrypt via Passlib"""
    try:
        # bcrypt has a 72-byte limit, so truncate if necessary
        if len(password.encode('utf-8')) > 72:
            password = password[:72]
        return pwd_context.hash(password)
    except Exception as e:
        logger.error(f"Error hashing password: {e}")
        # Fallback to legacy method if bcrypt fails
        import secrets
        salt = secrets.token_hex(16)
        return hashlib.sha256((password + salt).encode()).hexdigest() + ":" + salt


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against stored hash, supporting legacy SHA-256 hashes"""
    if not hashed:
        return False
    if _is_legacy_hash(hashed):
        return _verify_legacy_password(password, hashed)
    try:
        # bcrypt has a 72-byte limit, so truncate if necessary
        if len(password.encode('utf-8')) > 72:
            password = password[:72]
        return pwd_context.verify(password, hashed)
    except Exception as e:
        logger.error(f"Error verifying password: {e}")
        return False


def maybe_upgrade_password_hash(user: "User", plain_password: str, db: Session) -> None:
    """Re-hash legacy SHA-256 passwords with bcrypt on successful login."""
    if not _is_legacy_hash(user.hashed_password):
        return
    new_hash = hash_password(plain_password)
    user.hashed_password = new_hash
    try:
        db.add(user)
        db.commit()
    except Exception as exc:
        logger.warning("Failed to upgrade password hash for user %s: %s", user.username, exc)
        db.rollback()

def create_access_token(data: dict) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


DEMO_USERNAME = "demo_manager"
DEMO_EMAIL = "demo@classflow.local"
DEMO_TEACHER_PREFIX = "[Demo] "
DEMO_CLASS_PREFIX = "DEMO-"

DEMO_TEACHERS = [
    {"name": "Sarah Johnson", "specialization": "English", "email": "sarah@demo.local"},
    {"name": "Michael Chen", "specialization": "Mathematics", "email": "michael@demo.local"},
    {"name": "Emma Wilson", "specialization": "Science", "email": "emma@demo.local"},
    {"name": "David Park", "specialization": "History", "email": "david@demo.local"},
    {"name": "Lisa Thompson", "specialization": "Art", "email": "lisa@demo.local"},
]

DEMO_CLASSES = [
    {"code": "E1-A1", "campus": "E1", "level": "Beginner"},
    {"code": "E1-B2", "campus": "E1", "level": "Intermediate"},
    {"code": "E2-C1", "campus": "E2", "level": "Advanced"},
    {"code": "E2-D3", "campus": "E2", "level": "Intermediate"},
]

DEMO_LESSONS = [
    {"teacher_idx": 0, "class_idx": 0, "day": "Mon", "start": "17:00", "end": "17:30", "room": "101"},
    {"teacher_idx": 0, "class_idx": 0, "day": "Mon", "start": "17:30", "end": "18:00", "room": "101"},
    {"teacher_idx": 1, "class_idx": 1, "day": "Mon", "start": "17:00", "end": "17:30", "room": "102"},
    {"teacher_idx": 1, "class_idx": 1, "day": "Mon", "start": "17:30", "end": "18:00", "room": "102"},
    {"teacher_idx": 2, "class_idx": 2, "day": "Mon", "start": "18:00", "end": "18:30", "room": "201"},
    {"teacher_idx": 2, "class_idx": 2, "day": "Mon", "start": "18:30", "end": "19:00", "room": "201"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Mon", "start": "19:00", "end": "19:30", "room": "202"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Mon", "start": "19:30", "end": "20:00", "room": "202"},
    {"teacher_idx": 0, "class_idx": 1, "day": "Wed", "start": "17:00", "end": "17:30", "room": "101"},
    {"teacher_idx": 0, "class_idx": 1, "day": "Wed", "start": "17:30", "end": "18:00", "room": "101"},
    {"teacher_idx": 1, "class_idx": 2, "day": "Wed", "start": "18:00", "end": "18:30", "room": "103"},
    {"teacher_idx": 1, "class_idx": 2, "day": "Wed", "start": "18:30", "end": "19:00", "room": "103"},
    {"teacher_idx": 4, "class_idx": 0, "day": "Wed", "start": "17:00", "end": "17:30", "room": "201"},
    {"teacher_idx": 4, "class_idx": 0, "day": "Wed", "start": "17:30", "end": "18:00", "room": "201"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Wed", "start": "19:00", "end": "19:30", "room": "202"},
    {"teacher_idx": 3, "class_idx": 3, "day": "Wed", "start": "19:30", "end": "20:00", "room": "202"},
]


def get_or_create_demo_user(db: Session) -> User:
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
    return user


def _demo_week_context() -> dict:
    now = datetime.now()
    week_number = (now.day - 1) // 7 + 1
    return {
        "week": week_number,
        "month": now.month,
        "year": now.year,
        "week_number": week_number,
    }


def next_teacher_id(db: Session) -> int:
    current = db.query(Teacher.teacher_id).filter(Teacher.teacher_id.isnot(None)).order_by(Teacher.teacher_id.desc()).first()
    return (current[0] if current and current[0] is not None else -1) + 1


def next_class_id(db: Session) -> int:
    current = db.query(ClassModel.class_id).filter(ClassModel.class_id.isnot(None)).order_by(ClassModel.class_id.desc()).first()
    return (current[0] if current and current[0] is not None else -1) + 1


def ensure_demo_data(db: Session) -> None:
    demo_teachers = [
        teacher
        for teacher in db.query(Teacher).filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")).all()
        if teacher is not None
    ]
    demo_classes = [
        class_record
        for class_record in db.query(ClassModel).filter(ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%")).all()
        if class_record is not None
    ]

    if demo_teachers or demo_classes:
        demo_day_updates = {
            "Monday": "Mon",
            "Tuesday": "Tue",
            "Wednesday": "Wed",
            "Thursday": "Thu",
            "Friday": "Fri",
            "Saturday": "Sat",
            "Sunday": "Sun",
        }
        demo_teacher_ids = [
            teacher.teacher_id
            for teacher in demo_teachers
            if teacher.teacher_id is not None
        ]
        demo_class_ids = [
            class_record.class_id
            for class_record in demo_classes
            if class_record.class_id is not None
        ]
        invalid_demo_records = (
            any(teacher.teacher_id is None for teacher in demo_teachers) or
            any(class_record.class_id is None for class_record in demo_classes)
        )

        lesson_conditions = []
        if demo_teacher_ids:
            lesson_conditions.append(Lesson.teacher_id.in_(demo_teacher_ids))
        if demo_class_ids:
            lesson_conditions.append(Lesson.class_id.in_(demo_class_ids))
        demo_lessons = (
            db.query(Lesson).filter(or_(*lesson_conditions)).all()
            if lesson_conditions else []
        )

        if invalid_demo_records or (demo_teachers and demo_classes and not demo_lessons):
            if lesson_conditions:
                db.query(Lesson).filter(or_(*lesson_conditions)).delete(synchronize_session="fetch")
            db.query(Teacher).filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")).delete(synchronize_session="fetch")
            db.query(ClassModel).filter(ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%")).delete(synchronize_session="fetch")
            db.commit()
        else:
            changed = False
            for lesson in demo_lessons:
                normalized_day = demo_day_updates.get(lesson.day)
                if normalized_day and normalized_day != lesson.day:
                    lesson.day = normalized_day
                    changed = True
            if changed:
                db.commit()
            return

    ctx = _demo_week_context()
    teacher_ids = []
    teacher_id_seed = next_teacher_id(db)
    for teacher_data in DEMO_TEACHERS:
        teacher = Teacher(
            teacher_id=teacher_id_seed,
            name=f"{DEMO_TEACHER_PREFIX}{teacher_data['name']}",
            email=teacher_data["email"],
            specialization=teacher_data["specialization"],
            is_active=True,
            is_foreign=False,
        )
        db.add(teacher)
        db.flush()
        teacher_ids.append(teacher.teacher_id)
        teacher_id_seed += 1

    class_ids = []
    class_id_seed = next_class_id(db)
    for class_data in DEMO_CLASSES:
        demo_code = f"{DEMO_CLASS_PREFIX}{class_data['code']}"
        class_record = ClassModel(
            class_id=class_id_seed,
            code_new=demo_code,
            code_old=demo_code,
            name=demo_code,
            campus_name=class_data["campus"],
            level=class_data["level"],
            is_active=True,
        )
        db.add(class_record)
        db.flush()
        class_ids.append(class_record.class_id)
        class_id_seed += 1

    for lesson_data in DEMO_LESSONS:
        db.add(Lesson(
            teacher_id=teacher_ids[lesson_data["teacher_idx"]],
            class_id=class_ids[lesson_data["class_idx"]],
            day=lesson_data["day"],
            start_time=lesson_data["start"],
            end_time=lesson_data["end"],
            room=lesson_data["room"],
            week=ctx["week"],
            month=ctx["month"],
            year=ctx["year"],
            week_number=ctx["week_number"],
            month_week_id=str(ctx["week_number"]),
        ))

    db.commit()


def reset_demo_data(db: Session) -> dict:
    demo_teacher_ids = [
        teacher.teacher_id
        for teacher in db.query(Teacher).filter(Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")).all()
    ]
    demo_class_ids = [
        class_record.class_id
        for class_record in db.query(ClassModel).filter(ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%")).all()
    ]

    lessons_deleted = 0
    if demo_teacher_ids or demo_class_ids:
        filters = []
        if demo_teacher_ids:
            filters.append(Lesson.teacher_id.in_(demo_teacher_ids))
        if demo_class_ids:
            filters.append(Lesson.class_id.in_(demo_class_ids))
        lessons_deleted = db.query(Lesson).filter(or_(*filters)).delete(synchronize_session="fetch")

    teachers_deleted = db.query(Teacher).filter(
        Teacher.name.like(f"{DEMO_TEACHER_PREFIX}%")
    ).delete(synchronize_session="fetch")
    classes_deleted = db.query(ClassModel).filter(
        ClassModel.code_new.like(f"{DEMO_CLASS_PREFIX}%")
    ).delete(synchronize_session="fetch")
    db.query(User).filter(User.username == DEMO_USERNAME).delete(synchronize_session="fetch")
    db.commit()

    get_or_create_demo_user(db)
    ensure_demo_data(db)
    return {
        "teachers_deleted": teachers_deleted,
        "classes_deleted": classes_deleted,
        "lessons_deleted": lessons_deleted,
    }


def is_demo_user(user: Optional[User]) -> bool:
    return bool(user and user.username == DEMO_USERNAME)


def is_demo_teacher_name(name: Optional[str]) -> bool:
    return bool(name and name.startswith(DEMO_TEACHER_PREFIX))


def is_demo_class_code(code: Optional[str]) -> bool:
    return bool(code and code.startswith(DEMO_CLASS_PREFIX))


def demo_teacher_name(name: str, current_user: Optional[User]) -> str:
    if is_demo_user(current_user) and not is_demo_teacher_name(name):
        return f"{DEMO_TEACHER_PREFIX}{name}"
    return name


def demo_class_code(code: Optional[str], current_user: Optional[User]) -> Optional[str]:
    if code and is_demo_user(current_user) and not is_demo_class_code(code):
        return f"{DEMO_CLASS_PREFIX}{code}"
    return code


def day_aliases(day: Optional[str]) -> List[str]:
    mapping = {
        "Mon": ["Mon", "Monday"],
        "Monday": ["Mon", "Monday"],
        "Tue": ["Tue", "Tuesday"],
        "Tuesday": ["Tue", "Tuesday"],
        "Wed": ["Wed", "Wednesday"],
        "Wednesday": ["Wed", "Wednesday"],
        "Thu": ["Thu", "Thursday"],
        "Thursday": ["Thu", "Thursday"],
        "Fri": ["Fri", "Friday"],
        "Friday": ["Fri", "Friday"],
        "Sat": ["Sat", "Saturday"],
        "Saturday": ["Sat", "Saturday"],
        "Sun": ["Sun", "Sunday"],
        "Sunday": ["Sun", "Sunday"],
    }
    return mapping.get(day, [day] if day else [])


def apply_demo_scope_to_teacher_query(query, current_user: Optional[User], teacher_model=Teacher):
    if is_demo_user(current_user):
        query = query.filter(
            teacher_model.name.like(f"{DEMO_TEACHER_PREFIX}%"),
            teacher_model.teacher_id.isnot(None),
        )
    return query


def apply_demo_scope_to_class_query(query, current_user: Optional[User], class_model=ClassModel):
    if is_demo_user(current_user):
        query = query.filter(
            class_model.code_new.like(f"{DEMO_CLASS_PREFIX}%"),
            class_model.class_id.isnot(None),
        )
    return query


def apply_demo_scope_to_schedule_query(query, current_user: Optional[User], class_model=ClassModel, teacher_model=Teacher):
    if is_demo_user(current_user):
        query = query.filter(
            class_model.code_new.like(f"{DEMO_CLASS_PREFIX}%"),
            class_model.class_id.isnot(None),
            teacher_model.name.like(f"{DEMO_TEACHER_PREFIX}%"),
            teacher_model.teacher_id.isnot(None),
        )
    return query


def ensure_demo_teacher_access(teacher: Optional[Teacher], current_user: Optional[User]) -> None:
    if teacher is None:
        return
    if is_demo_user(current_user) and not is_demo_teacher_name(teacher.name):
        raise HTTPException(404, "Teacher not found")


def ensure_demo_class_access(class_record: Optional[ClassModel], current_user: Optional[User]) -> None:
    if class_record is None:
        return
    if is_demo_user(current_user) and not is_demo_class_code(class_record.code_new):
        raise HTTPException(404, "Class not found")


def ensure_demo_lesson_access(
    db: Session,
    *,
    current_user: Optional[User],
    lesson: Optional[Lesson] = None,
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
) -> None:
    if not is_demo_user(current_user):
        return

    if lesson is not None:
        teacher_id = lesson.teacher_id
        class_id = lesson.class_id

    if teacher_id is not None:
        teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
        ensure_demo_teacher_access(teacher, current_user)
    if class_id is not None:
        class_record = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
        ensure_demo_class_access(class_record, current_user)

# DB session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    """Get current user from JWT token"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

def require_role(required_roles: List[UserRole]):
    """Dependency to require specific roles"""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied. Required roles: {[r.value for r in required_roles]}"
            )
        return current_user
    return role_checker

# Convenience role dependencies
require_admin = require_role([UserRole.ADMIN])
require_manager_or_admin = require_role([UserRole.MANAGER, UserRole.ADMIN])
require_any_role = require_role([UserRole.TEACHER, UserRole.MANAGER, UserRole.ADMIN])

# Calendar anchor API
class AnchorOut(BaseModel):
    anchor_date: str  # ISO date YYYY-MM-DD (Monday of academic week 1)

@app.get("/calendar/anchor", response_model=AnchorOut)
def get_calendar_anchor(db: Session = Depends(get_db)) -> AnchorOut:
    """Return the earliest week present in lessons as anchor Monday.
    If no data, default to today's Monday.
    """
    anchor_candidate: Optional[datetime] = None

    # Prefer month-based week metadata when available to derive a stable anchor
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT year, month, week_number
                    FROM lesson
                    WHERE year IS NOT NULL AND month IS NOT NULL AND week_number IS NOT NULL
                    ORDER BY year ASC, month ASC, week_number ASC
                    LIMIT 1
                    """
                )
            )
            .mappings()
            .first()
        )
        if row:
            year = int(row["year"])
            month = int(row["month"])
            anchor_candidate = datetime(year, month, 1)
            # Align to the Monday of the first teaching week for that month
            while anchor_candidate.weekday() != 0:
                anchor_candidate += timedelta(days=1)
    except Exception:
        anchor_candidate = None

    if anchor_candidate is None:
        # Fallback to legacy week-based estimation
        try:
            row = db.execute(text("SELECT MIN(week) AS min_week FROM lesson")).fetchone()
            min_week = int(row.min_week) if row and row.min_week is not None else None  # type: ignore[attr-defined]
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

# Remove duplicate lifespan definition

def ensure_indexes() -> None:
    """Ensure database schema and indexes exist"""
    try:
        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)
        backend_name = inspector.engine.name

        with engine.connect() as conn:
            # Ensure room column exists (SQLite-specific approach; for PostgreSQL it's part of the model)
            if backend_name == "sqlite":
                try:
                    res = conn.execute(text("PRAGMA table_info(lesson)")).fetchall()
                    column_lookup = {
                        getattr(r, "name", None) or (r[1] if isinstance(r, tuple) and len(r) > 1 else None): r
                        for r in res
                    }
                    has_room = any(
                        name == "room"
                        for name in column_lookup.keys()
                    )
                    if not has_room:
                        conn.execute(text("ALTER TABLE lesson ADD COLUMN room TEXT"))
                        logger.info("Added room column to lesson table")
                    # Promote legacy id column to INTEGER PRIMARY KEY AUTOINCREMENT if needed
                    id_column = column_lookup.get("id")
                    # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
                    pk_flag = None
                    column_type = None
                    if id_column is not None:
                        if isinstance(id_column, tuple):
                            _, _, column_type, _, _, pk_flag = id_column
                        else:
                            column_type = getattr(id_column, "type", None)
                            pk_flag = getattr(id_column, "pk", None)
                    needs_rebuild = False
                    if id_column is None:
                        needs_rebuild = True
                    else:
                        normalized_type = (column_type or "").upper()
                        if pk_flag != 1 or normalized_type not in {"INTEGER", "INT", "BIGINT"}:
                            needs_rebuild = True
                    if needs_rebuild:
                        logger.warning("Rebuilding lesson table to ensure auto-incrementing primary key")
                        try:
                            conn.execute(text("DROP TABLE IF EXISTS lesson_legacy_autoinc"))
                            conn.execute(text("ALTER TABLE lesson RENAME TO lesson_legacy_autoinc"))
                            conn.execute(text(
                                """
                                CREATE TABLE lesson (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    class_id BIGINT REFERENCES class(class_id),
                                    teacher_id BIGINT REFERENCES teacher(teacher_id),
                                    co_teacher_id INTEGER REFERENCES teacher(teacher_id),
                                    week BIGINT,
                                    day TEXT,
                                    start_time TEXT,
                                    end_time TEXT,
                                    room TEXT,
                                    month_week_id TEXT,
                                    month BIGINT,
                                    year BIGINT,
                                    week_number BIGINT
                                )
                                """
                            ))
                            column_order = [
                                "id",
                                "class_id",
                                "teacher_id",
                                "co_teacher_id",
                                "week",
                                "day",
                                "start_time",
                                "end_time",
                                "room",
                                "month_week_id",
                                "month",
                                "year",
                                "week_number",
                            ]
                            column_csv = ", ".join(column_order)
                            conn.execute(text(
                                f"INSERT INTO lesson ({column_csv}) SELECT {column_csv} FROM lesson_legacy_autoinc"
                            ))
                            conn.execute(text("DROP TABLE lesson_legacy_autoinc"))
                            logger.info("Lesson table rebuilt with auto-incrementing primary key")
                        except Exception as rebuild_error:
                            logger.error(f"Failed to rebuild lesson table: {rebuild_error}")
                            conn.execute(text("ALTER TABLE lesson_legacy_autoinc RENAME TO lesson"))
                            raise
                except Exception as e:
                    logger.warning(f"Could not check/add room column: {e}")
            
            # Create indexes, respecting reserved keywords in PostgreSQL
            lesson_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_lesson_teacher_week_day_time ON lesson(teacher_id, week, day, start_time, end_time)",
                "CREATE INDEX IF NOT EXISTS idx_lesson_class_week_day_time ON lesson(class_id, week, day, start_time, end_time)",
                "CREATE INDEX IF NOT EXISTS idx_lesson_room ON lesson(room)",
                "CREATE UNIQUE INDEX IF NOT EXISTS uniq_lesson ON lesson(class_id, teacher_id, week, day, start_time, end_time)"
            ]
            
            user_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_user_username ON \"user\"(username)",
                "CREATE INDEX IF NOT EXISTS idx_user_email ON \"user\"(email)",
                "CREATE INDEX IF NOT EXISTS idx_user_role ON \"user\"(role)"
            ]

            for idx_sql in lesson_indexes + user_indexes:
                try:
                    conn.execute(text(idx_sql))
                except Exception as e:
                    logger.warning(f"Could not create index: {e}")
            
            conn.commit()
            logger.info("Database schema and indexes ensured")

        _create_default_admin()

    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

def _create_default_admin() -> None:
    """Create an initial admin user when no accounts exist and secure credentials are provided."""
    admin_username = os.getenv("ADMIN_BOOTSTRAP_USERNAME")
    admin_password = os.getenv("ADMIN_BOOTSTRAP_PASSWORD")
    admin_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL")

    try:
        db = SessionLocal()
        try:
            existing_users = db.query(User).count()
            if existing_users > 0:
                return

            if not admin_username or not admin_password or not admin_email:
                message = (
                    "No admin bootstrap credentials provided; initial admin account was not created."
                )
                if ENVIRONMENT in {"production", "prod"}:
                    raise RuntimeError(message)
                logger.warning(message)
                return

            admin_user = User(
                username=admin_username,
                email=admin_email,
                hashed_password=hash_password(admin_password),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            logger.info("Created initial admin user %s from bootstrap credentials", admin_username)
        except Exception as e:
            logger.warning(f"Could not create bootstrap admin user: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to create bootstrap admin: {e}")

def check_lesson_conflicts(db: Session, lesson_data: LessonCreate, exclude_lesson_id: Optional[int] = None) -> List[str]:
    """Check for scheduling conflicts with a new or updated lesson"""
    conflicts = []
    
    # Get teacher and class info for better error messages
    teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.teacher_id).first()
    class_info = db.query(ClassModel).filter(ClassModel.class_id == lesson_data.class_id).first()
    
    if not teacher:
        conflicts.append(f"Teacher with ID {lesson_data.teacher_id} not found")
        return conflicts
    
    if not class_info:
        conflicts.append(f"Class with ID {lesson_data.class_id} not found")
        return conflicts
    
    # Build query for existing lessons in the same time slot
    conflict_query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(
            Lesson.day == lesson_data.day,
        )
    )
    
    # Filter by week or month-based week depending on what's available
    if lesson_data.week is not None:
        conflict_query = conflict_query.filter(Lesson.week == lesson_data.week)
    elif lesson_data.month is not None and lesson_data.year is not None and lesson_data.week_number is not None:
        conflict_query = conflict_query.filter(
            Lesson.month == lesson_data.month,
            Lesson.year == lesson_data.year,
            Lesson.week_number == lesson_data.week_number
        )
    
    # Exclude the lesson being updated
    if exclude_lesson_id:
        conflict_query = conflict_query.filter(Lesson.id != exclude_lesson_id)
    
    existing_lessons = conflict_query.all()
    
    # Check for time overlaps
    for lesson, cls, existing_teacher in existing_lessons:
        # Skip if lesson is None (shouldn't happen but safety check)
        if lesson is None:
            continue
            
        # Check if times overlap
        if (lesson.start_time < lesson_data.end_time and lesson.end_time > lesson_data.start_time):
            # Teacher conflict
            if lesson.teacher_id == lesson_data.teacher_id:
                conflicts.append(
                    f"Teacher {teacher.name} is already scheduled for {cls.code_new or cls.code_old} "
                    f"from {lesson.start_time} to {lesson.end_time}"
                )
            
            # BIDIRECTIONAL co-teacher conflict detection:
            # - If NEW lesson has a co-teacher, check if that co-teacher is primary in another lesson
            # - If EXISTING lesson has a co-teacher, check if new teacher matches it
            if lesson_data.co_teacher_id:
                # Check if the new co-teacher is already primary teacher in another lesson
                if lesson.teacher_id == lesson_data.co_teacher_id:
                    co_teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.co_teacher_id).first()
                    if co_teacher:
                        conflicts.append(
                            f"Co-teacher {co_teacher.name} is already scheduled as primary teacher for {cls.code_new or cls.code_old} "
                            f"from {lesson.start_time} to {lesson.end_time}"
                        )
            
            # If existing lesson has a co-teacher, check if new teacher matches it
            if lesson.co_teacher_id == lesson_data.teacher_id:
                conflicts.append(
                    f"Teacher {teacher.name} is already scheduled as co-teacher for {cls.code_new or cls.code_old} "
                    f"from {lesson.start_time} to {lesson.end_time}"
                )
            
            # Co-teacher conflict (if both lessons have co-teachers)
            if lesson_data.co_teacher_id and lesson.co_teacher_id and lesson.co_teacher_id == lesson_data.co_teacher_id:
                co_teacher = db.query(Teacher).filter(Teacher.teacher_id == lesson_data.co_teacher_id).first()
                if co_teacher:
                    conflicts.append(
                        f"Co-teacher {co_teacher.name} is already scheduled for {cls.code_new or cls.code_old} "
                        f"from {lesson.start_time} to {lesson.end_time}"
                    )
            
            # Room conflict
            if lesson_data.room and lesson.room and lesson.room == lesson_data.room:
                conflicts.append(
                    f"Room {lesson_data.room} is already booked for {existing_teacher.name} "
                    f"({cls.code_new or cls.code_old}) from {lesson.start_time} to {lesson.end_time}"
                )

    # If there are no teacher/room conflicts but only co-teacher chosen, allow it
    # Co-teachers are assistants and can overlap with primary teacher's slots
    if conflicts and lesson_data.co_teacher_id and not any(
        msg.startswith("Teacher ") or msg.startswith("Room ") for msg in conflicts
    ):
        conflicts = []
    
    return conflicts

def group_consecutive_lessons(lessons: List[LessonOut]) -> List[LessonOut]:
    """Group consecutive 30-minute slots into longer sessions"""
    if not lessons:
        return []
    
    grouped = []
    current_group = [lessons[0]]
    
    for lesson in lessons[1:]:
        last_lesson = current_group[-1]
        
        # Check if lessons are consecutive (same campus, class, teacher, week, day, and time slots connect)
        if (lesson.week == last_lesson.week and 
            lesson.day == last_lesson.day and
            lesson.class_code == last_lesson.class_code and
            lesson.teacher_name == last_lesson.teacher_name and
            lesson.campus_name == last_lesson.campus_name and
            last_lesson.end_time == lesson.start_time):
            
            current_group.append(lesson)
        else:
            # Finalize current group
            if current_group:
                grouped.append(_create_grouped_lesson(current_group))
            
            current_group = [lesson]
    
    # Don't forget the last group
    if current_group:
        grouped.append(_create_grouped_lesson(current_group))
    
    return grouped

def _create_grouped_lesson(group: List[LessonOut]) -> LessonOut:
    """Helper to create a grouped lesson from consecutive slots"""
    first, last = group[0], group[-1]
    start_time = datetime.strptime(first.start_time, '%H:%M')
    end_time = datetime.strptime(last.end_time, '%H:%M')
    duration = int((end_time - start_time).total_seconds() / 60)
    # Merge co-teachers across the group and keep them unique/preserved order
    merged_co: List[str] = []
    for item in group:
        if getattr(item, 'co_teachers', None):
            for name in item.co_teachers:  # type: ignore[attr-defined]
                if name not in merged_co:
                    merged_co.append(name)
    
    return LessonOut(
        id=first.id,
        week=first.week,
        day=first.day,
        start_time=first.start_time,
        end_time=last.end_time,
        class_code=first.class_code,
        teacher_name=first.teacher_name,
        teacher_id=getattr(first, 'teacher_id', None),
        class_id=getattr(first, 'class_id', None),
        co_teacher_id=getattr(first, 'co_teacher_id', None),
        co_teacher_name=getattr(first, 'co_teacher_name', None),
        campus_name=first.campus_name,
        room=first.room,
        co_teachers=merged_co or None,
        duration_minutes=duration,
        notes=getattr(first, 'notes', None),
        month=getattr(first, 'month', None),
        year=getattr(first, 'year', None),
        week_number=getattr(first, 'week_number', None),
        month_week_display=getattr(first, 'month_week_display', None)
    )

def _build_lessons_from_rows(
    rows,
    co_map: Optional[Dict[Tuple[int, int, str, str, str], List[str]]] = None,
    exclude_teacher: Optional[str] = None,
    viewing_teacher_id: Optional[int] = None,
) -> List[LessonOut]:
    """Convert DB rows to LessonOut objects, optionally attaching co-teachers
    
    Args:
        rows: Database rows containing lesson, class, teacher, and co-teacher info
        co_map: Map of co-teachers for each lesson slot
        exclude_teacher: Name of teacher to exclude from co-teacher lists
        viewing_teacher_id: If provided, swap roles when viewing teacher is co-teacher
    """
    items: List[LessonOut] = []
    norm_exclude = exclude_teacher.strip().casefold() if exclude_teacher else None
    
    # Handle both old format (lesson, cls, teacher) and new format (lesson, cls, teacher, co_teacher)
    for row in rows:
        if len(row) == 3:
            lesson, cls, teacher = row
            co_teacher = None
        else:
            lesson, cls, teacher, co_teacher = row
        if lesson is None or cls is None or teacher is None:
            continue
        key = (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        co_list = None
        if co_map is not None and key in co_map:
            names = co_map[key]
            if norm_exclude is not None:
                names = [n for n in names if n.strip().casefold() != norm_exclude]
            co_list = names or None

        # If viewing_teacher_id is provided and matches the co_teacher_id, swap roles
        # This makes the co-teacher appear as the primary teacher in their own view
        if viewing_teacher_id and lesson.co_teacher_id and lesson.co_teacher_id == viewing_teacher_id:
            # Swap: co-teacher becomes primary, primary becomes co-teacher
            primary_teacher = co_teacher  # co-teacher (viewing teacher) becomes primary
            assistant_teacher = teacher   # original primary becomes assistant
            primary_teacher_id = lesson.co_teacher_id  # co-teacher ID becomes primary
            assistant_teacher_id = lesson.teacher_id   # original primary ID becomes assistant
        else:
            # Normal case: keep roles as they are in database
            primary_teacher = teacher
            assistant_teacher = co_teacher
            primary_teacher_id = lesson.teacher_id
            assistant_teacher_id = lesson.co_teacher_id

        items.append(
            LessonOut(
                id=lesson.id,
                week=lesson.week,
                day=lesson.day,
                start_time=lesson.start_time,
                end_time=lesson.end_time,
                class_code=(cls.code_new or cls.code_old),
                teacher_name=primary_teacher.name,
                teacher_id=primary_teacher.teacher_id,  # Primary teacher ID (swapped if viewing co-teacher)
                class_id=cls.class_id,  # Add class ID for editing
                co_teacher_id=assistant_teacher_id,  # Co-teacher ID (swapped if viewing co-teacher)
                co_teacher_name=assistant_teacher.name if assistant_teacher else None,  # Co-teacher name (swapped)
                campus_name=cls.campus_name,
                room=getattr(lesson, 'room', None),
                co_teachers=co_list,
                duration_minutes=30,
                notes=getattr(lesson, 'notes', None),  # Add notes field
                # Month-based week fields
                month=lesson.month,
                year=lesson.year,
                week_number=lesson.week_number,
                month_week_display=get_week_display_name(lesson.year, lesson.month, lesson.week_number) if lesson.month and lesson.year and lesson.week_number else None
            )
        )
    return items

def _deduplicate_lessons(lessons: List[LessonOut]) -> List[LessonOut]:
    """Remove duplicate lessons"""
    seen, unique = set(), []
    for item in lessons:
        key = (item.week, item.day, item.start_time, item.end_time, 
               item.class_code, item.teacher_name, item.campus_name)
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique

# Authentication endpoints
@app.post("/auth/register", response_model=UserOut)
def register(user_data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Register a new user (admin only)"""
    # Check if username or email already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(400, "Username already exists")
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(400, "Email already exists")
    
    # Validate teacher_id if provided
    if user_data.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.teacher_id == user_data.teacher_id).first()
        if not teacher:
            raise HTTPException(400, f"Teacher with id {user_data.teacher_id} not found")
    
    # Create new user
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
        teacher_id=user_data.teacher_id
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user

@app.post("/auth/users", response_model=UserOut)
def create_user(
    user_data: UserCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new user (admin only)"""
    # Check if user already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate teacher_id if provided
    if user_data.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.teacher_id == user_data.teacher_id).first()
        if not teacher:
            raise HTTPException(400, f"Teacher with id {user_data.teacher_id} not found")
    
    # Hash password
    hashed_password = hash_password(user_data.password)
    
    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
        teacher_id=user_data.teacher_id,
        is_active=True
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return UserOut(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        teacher_id=user.teacher_id,
        created_at=user.created_at.isoformat()
    )

@app.post("/auth/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token"""
    user = db.query(User).filter(User.username == user_credentials.username).first()
    
    if not user or not user.is_active or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    if _is_legacy_hash(user.hashed_password):
        maybe_upgrade_password_hash(user, user_credentials.password, db)
    
    access_token = create_access_token({"sub": user.username})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.from_orm(user)
    )


@app.post("/auth/demo-login", response_model=Token)
def demo_login(db: Session = Depends(get_db)):
    """Authenticate into the shared demo workspace and seed data if needed."""
    try:
        user = get_or_create_demo_user(db)
        ensure_demo_data(db)
        access_token = create_access_token({"sub": user.username})
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=UserOut.from_orm(user),
        )
    except Exception as exc:
        logger.exception("Demo login failed")
        raise HTTPException(500, f"Demo login failed: {exc}")


@app.post("/auth/demo-reset")
def demo_reset(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Reset shared demo records and regenerate the demo workspace."""
    counts = reset_demo_data(db)
    return {"message": "Demo data reset successfully", **counts}

@app.get("/auth/me", response_model=UserOut)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@app.get("/auth/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """List all users (admin only)"""
    users = db.query(User).all()
    return users

@app.put("/auth/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update user (admin only)"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Update fields
    user.username = user_data.username
    user.email = user_data.email
    user.role = user_data.role
    user.teacher_id = user_data.teacher_id
    
    # Update password if provided
    if user_data.password:
        user.hashed_password = hash_password(user_data.password)
    
    db.commit()
    db.refresh(user)
    return user

@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Delete user (admin only)"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    if user.user_id == current_user.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

# Lesson CRUD endpoints
@app.post("/lessons/check-conflicts", response_model=ConflictCheck)
def check_conflicts(
    lesson_data: LessonCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_manager_or_admin)
):
    """Check for conflicts before creating a lesson"""
    ensure_demo_lesson_access(
        db,
        current_user=current_user,
        teacher_id=lesson_data.teacher_id,
        class_id=lesson_data.class_id,
    )
    conflicts = check_lesson_conflicts(db, lesson_data)
    return ConflictCheck(conflicts=conflicts, can_create=len(conflicts) == 0)

def validate_lesson_times(start_time: str, end_time: str) -> None:
    """Validate that lesson times are within allowed range (17:00 - 20:30)"""
    if start_time < '17:00' or start_time > '20:30':
        raise HTTPException(400, f"Start time must be between 17:00 (5:00 PM) and 20:30 (8:30 PM), got {start_time}")
    if end_time < '17:00' or end_time > '20:30':
        raise HTTPException(400, f"End time must be between 17:00 (5:00 PM) and 20:30 (8:30 PM), got {end_time}")
    if start_time >= end_time:
        raise HTTPException(400, "End time must be after start time")

@app.post("/lessons", response_model=LessonOut)
def create_lesson(
    lesson_data: LessonCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_manager_or_admin)
):
    """Create a new lesson"""
    ensure_demo_lesson_access(
        db,
        current_user=current_user,
        teacher_id=lesson_data.teacher_id,
        class_id=lesson_data.class_id,
    )
    # Validate time restrictions
    validate_lesson_times(lesson_data.start_time, lesson_data.end_time)
    
    # Check for conflicts
    conflicts = check_lesson_conflicts(db, lesson_data)
    if conflicts:
        raise HTTPException(400, f"Cannot create lesson due to conflicts: {'; '.join(conflicts)}")
    
    # Create the lesson
    new_lesson = Lesson(
        teacher_id=lesson_data.teacher_id,
        co_teacher_id=lesson_data.co_teacher_id,
        class_id=lesson_data.class_id,
        week=(lesson_data.week if lesson_data.week is not None else lesson_data.week_number),
        day=lesson_data.day,
        start_time=lesson_data.start_time,
        end_time=lesson_data.end_time,
        room=lesson_data.room,
        # Month-based week fields
        month=lesson_data.month,
        year=lesson_data.year,
        week_number=lesson_data.week_number,
        month_week_id=lesson_data.week_number  # Simple mapping for now
    )
    
    db.add(new_lesson)

    try:
        db.commit()
        try:
            db.refresh(new_lesson)
        except Exception as refresh_error:
            logger.warning(f"Primary refresh failed for lesson insert, attempting fallback lookup: {refresh_error}")
            fallback = (
                db.query(Lesson)
                .filter(
                    Lesson.class_id == new_lesson.class_id,
                    Lesson.teacher_id == new_lesson.teacher_id,
                    Lesson.day == new_lesson.day,
                    Lesson.start_time == new_lesson.start_time,
                    Lesson.end_time == new_lesson.end_time,
                    Lesson.room == new_lesson.room,
                    Lesson.week == new_lesson.week,
                )
                .order_by(Lesson.id.desc())
                .first()
            )
            if fallback is None:
                raise HTTPException(status_code=500, detail="Lesson saved but could not be reloaded. Please refresh and verify.")
            new_lesson = fallback
    except IntegrityError as exc:
        db.rollback()

        message = "Unable to create lesson"
        detail_text = str(exc.orig) if getattr(exc, "orig", None) else str(exc)

        if "UNIQUE constraint failed" in detail_text:
            message = (
                "Lesson already exists for this class, teacher, week, day and time. "
                "Please adjust the slot or edit the existing lesson instead."
            )
            raise HTTPException(status_code=409, detail=message)

        if "FOREIGN KEY constraint failed" in detail_text:
            message = (
                "Invalid teacher or co-teacher selection. Please re-select from the list."
            )
            raise HTTPException(status_code=400, detail=message)

        raise HTTPException(status_code=500, detail=message)
    
    # Return the created lesson in the expected format
    lesson_with_details = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.id == new_lesson.id)
        .first()
    )
    
    if not lesson_with_details:
        raise HTTPException(500, "Failed to retrieve created lesson")
    
    lesson, cls, teacher = lesson_with_details
    
    # Generate month_week_display if month-based week fields are available
    month_week_display = None
    if lesson.month and lesson.year and lesson.week_number:
        month_week_display = get_week_display_name(lesson.year, lesson.month, lesson.week_number)
    
    return LessonOut(
        id=lesson.id,
        week=lesson.week,
        day=lesson.day,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        class_code=cls.code_new or cls.code_old,
        teacher_name=teacher.name,
        campus_name=cls.campus_name,
        room=lesson.room,
        duration_minutes=30,  # Default to 30 minutes
        # Month-based week fields
        month=lesson.month,
        year=lesson.year,
        week_number=lesson.week_number,
        month_week_display=month_week_display
    )

@app.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson(
    lesson_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_any_role)
):
    """Get a specific lesson by ID"""
    lesson_with_details = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.id == lesson_id)
        .first()
    )
    
    if not lesson_with_details:
        raise HTTPException(404, "Lesson not found")
    
    lesson, cls, teacher = lesson_with_details
    ensure_demo_lesson_access(db, current_user=current_user, lesson=lesson)
    
    # Generate month_week_display if month-based week fields are available
    month_week_display = None
    if lesson.month and lesson.year and lesson.week_number:
        month_week_display = get_week_display_name(lesson.year, lesson.month, lesson.week_number)
    
    return LessonOut(
        id=lesson.id,
        week=lesson.week,
        day=lesson.day,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        class_code=cls.code_new or cls.code_old,
        teacher_name=teacher.name,
        campus_name=cls.campus_name,
        room=lesson.room,
        duration_minutes=30,
        # Month-based week fields
        month=lesson.month,
        year=lesson.year,
        week_number=lesson.week_number,
        month_week_display=month_week_display
    )

@app.put("/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(
    lesson_id: int,
    lesson_update: LessonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Update an existing lesson"""
    # Get the existing lesson
    existing_lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not existing_lesson:
        raise HTTPException(404, "Lesson not found")
    ensure_demo_lesson_access(db, current_user=current_user, lesson=existing_lesson)
    
    # Determine final start_time and end_time values
    final_start_time = lesson_update.start_time or existing_lesson.start_time
    final_end_time = lesson_update.end_time or existing_lesson.end_time
    
    # Validate time restrictions
    validate_lesson_times(final_start_time, final_end_time)
    
    # Create a LessonCreate object for conflict checking with updated values
    lesson_data = LessonCreate(
        teacher_id=lesson_update.teacher_id or existing_lesson.teacher_id,
        class_id=lesson_update.class_id or existing_lesson.class_id,
        week=lesson_update.week or existing_lesson.week,
        day=lesson_update.day or existing_lesson.day,
        start_time=final_start_time,
        end_time=final_end_time,
        room=lesson_update.room if lesson_update.room is not None else existing_lesson.room,
        # Include month-based week fields for proper conflict checking
        month=lesson_update.month or existing_lesson.month,
        year=lesson_update.year or existing_lesson.year,
        week_number=lesson_update.week_number or existing_lesson.week_number
    )
    ensure_demo_lesson_access(
        db,
        current_user=current_user,
        teacher_id=lesson_data.teacher_id,
        class_id=lesson_data.class_id,
    )
    
    # Check for conflicts (excluding the current lesson)
    conflicts = check_lesson_conflicts(db, lesson_data, exclude_lesson_id=lesson_id)
    if conflicts:
        raise HTTPException(400, f"Cannot update lesson due to conflicts: {'; '.join(conflicts)}")
    
    # Update the lesson
    if lesson_update.teacher_id is not None:
        existing_lesson.teacher_id = lesson_update.teacher_id
    if lesson_update.class_id is not None:
        existing_lesson.class_id = lesson_update.class_id
    if lesson_update.week is not None:
        existing_lesson.week = lesson_update.week
    if lesson_update.day is not None:
        existing_lesson.day = lesson_update.day
    if lesson_update.start_time is not None:
        existing_lesson.start_time = lesson_update.start_time
    if lesson_update.end_time is not None:
        existing_lesson.end_time = lesson_update.end_time
    if lesson_update.room is not None:
        existing_lesson.room = lesson_update.room
    # Update month-based week fields
    if lesson_update.month is not None:
        existing_lesson.month = lesson_update.month
    if lesson_update.year is not None:
        existing_lesson.year = lesson_update.year
    if lesson_update.week_number is not None:
        existing_lesson.week_number = lesson_update.week_number
    
    db.commit()
    db.refresh(existing_lesson)
    
    # Return the updated lesson
    lesson_with_details = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.id == lesson_id)
        .first()
    )
    
    lesson, cls, teacher = lesson_with_details
    return LessonOut(
        id=lesson.id,
        week=lesson.week,
        day=lesson.day,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        class_code=cls.code_new or cls.code_old,
        teacher_name=teacher.name,
        campus_name=cls.campus_name,
        room=lesson.room,
        duration_minutes=30
    )

@app.delete("/lessons/{lesson_id}")
def delete_lesson(
    lesson_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_manager_or_admin)
):
    """Delete a lesson"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    ensure_demo_lesson_access(db, current_user=current_user, lesson=lesson)
    
    db.delete(lesson)
    db.commit()
    return {"message": "Lesson deleted successfully"}

@app.get("/weeks/{year}/{month}")
def get_weeks_for_month_endpoint(
    year: int,
    month: int,
    current_user: User = Depends(require_any_role)
):
    """Get available weeks for a specific month"""
    try:
        weeks = get_weeks_for_month(year, month)
        return [
            {
                "week_number": week_num,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "display_name": get_week_display_name(year, month, week_num)
            }
            for week_num, start_date, end_date in weeks
        ]
    except Exception as e:
        raise HTTPException(400, f"Invalid month/year: {e}")

@app.get("/current-month-week")
def get_current_month_week_endpoint(
    current_user: User = Depends(require_any_role)
):
    """Get current month and week"""
    year, month, week_number = get_current_month_week()
    return {
        "year": year,
        "month": month,
        "week_number": week_number,
        "display_name": get_week_display_name(year, month, week_number)
    }

@app.get("/lessons", response_model=List[LessonOut])
def list_lessons(
    week: Optional[int] = None,
    day: Optional[str] = None,
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
    room: Optional[str] = None,
    # New month-based week parameters
    month: Optional[int] = None,
    year: Optional[int] = None,
    week_number: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role)
):
    """List lessons with optional filters"""
    query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
    )
    query = apply_demo_scope_to_schedule_query(query, current_user)
    
    # Prioritize month-based week filtering over legacy week filtering
    if month is not None and year is not None and week_number is not None:
        query = query.filter(
            Lesson.month == month,
            Lesson.year == year,
            Lesson.week_number == week_number
        )
    elif week is not None:
        query = query.filter(Lesson.week == week)
    
    if day is not None:
        query = query.filter(Lesson.day.in_(day_aliases(day)))
    if teacher_id is not None:
        query = query.filter(Lesson.teacher_id == teacher_id)
    if class_id is not None:
        query = query.filter(Lesson.class_id == class_id)
    if room is not None:
        query = query.filter(Lesson.room == room)
    
    lessons = query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()
    
    result = []
    for lesson, cls, teacher in lessons:
        # Skip if any of the joined objects are None (safety check)
        if lesson is None or cls is None or teacher is None:
            logger.warning(f"Skipping lesson due to None object: lesson={lesson}, cls={cls}, teacher={teacher}")
            continue
            
        # Generate month_week_display if month-based week fields are available
        month_week_display = None
        if lesson.month and lesson.year and lesson.week_number:
            month_week_display = get_week_display_name(lesson.year, lesson.month, lesson.week_number)
        
        result.append(LessonOut(
            id=lesson.id,
            week=lesson.week,
            day=lesson.day,
            start_time=lesson.start_time,
            end_time=lesson.end_time,
            class_code=cls.code_new or cls.code_old,
            teacher_name=teacher.name,
            campus_name=cls.campus_name,
            room=lesson.room,
            duration_minutes=30,
            # Month-based week fields
            month=lesson.month,
            year=lesson.year,
            week_number=lesson.week_number,
            month_week_display=month_week_display
        ))
    
    return result

def _get_schedule_rows(
    db: Session,
    current_user: Optional[User] = None,
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    week_number: Optional[int] = None
) -> List[Tuple[Lesson, ClassModel, Teacher, Teacher]]:
    """Get schedule rows based on filters"""
    from sqlalchemy.orm import aliased
    CoTeacher = aliased(Teacher)
    
    query = (
        db.query(Lesson, ClassModel, Teacher, CoTeacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .outerjoin(CoTeacher, Lesson.co_teacher_id == CoTeacher.teacher_id)
    )
    query = apply_demo_scope_to_schedule_query(query, current_user)
    
    # Filter by teacher (both as primary teacher AND as co-teacher)
    if teacher_id is not None:
        query = query.filter(
            or_(
                Lesson.teacher_id == teacher_id,
                Lesson.co_teacher_id == teacher_id
            )
        )
    
    # Filter by class
    if class_id is not None:
        query = query.filter(Lesson.class_id == class_id)
    
    # Filter by campus
    if campus is not None:
        query = query.filter(ClassModel.campus_name == campus)
    
    # Prioritize month-based week filtering over legacy week filtering
    if month is not None and year is not None and week_number is not None:
        query = query.filter(
            Lesson.month == month,
            Lesson.year == year,
            Lesson.week_number == week_number
        )
    elif week is not None:
        query = query.filter(Lesson.week == week)
    
    # Filter by day
    if day is not None:
        query = query.filter(Lesson.day.in_(day_aliases(day)))
    
    return query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()

@app.get("/my/{teacher_id}", response_model=List[LessonOut])
def get_teacher_schedule(
    teacher_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    # New month-based week parameters
    month: Optional[int] = None,
    year: Optional[int] = None,
    week_number: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> List[LessonOut]:
    """Get schedule for a specific teacher"""
    # Validate teacher exists
    teacher_exists = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    ensure_demo_teacher_access(teacher_exists, current_user)
    if not teacher_exists:
        raise HTTPException(404, f"Teacher with id {teacher_id} not found")
    
    rows = _get_schedule_rows(db, current_user=current_user, teacher_id=teacher_id, week=week, day=day, campus=campus, month=month, year=year, week_number=week_number)
    
    # If no rows, return an empty list (better UX for frontend)
    if not rows:
        return []
    
    # Build co-teacher map for the same class/week/day/time slots
    # Gather keys from selected teacher's rows
    keys: List[Tuple[int, int, str, str, str]] = [
        (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        for lesson, cls, _, _ in rows
        if lesson is not None and cls is not None
    ]
    if keys:
        class_ids = {k[0] for k in keys}
        weeks = {k[1] for k in keys}
        days = {k[2] for k in keys}
        starts = {k[3] for k in keys}
        ends = {k[4] for k in keys}

        others = (
            db.query(Lesson, ClassModel, Teacher)
            .join(ClassModel, Lesson.class_id == ClassModel.class_id)
            .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
            .filter(Lesson.class_id.in_(class_ids))
            .filter(Lesson.week.in_(weeks))
            .filter(Lesson.day.in_(days))
            .filter(Lesson.start_time.in_(starts))
            .filter(Lesson.end_time.in_(ends))
        )
        others = apply_demo_scope_to_schedule_query(others, current_user).all()
        co_map: Dict[Tuple[int, int, str, str, str], List[str]] = {}
        # Only attach co-teachers that are complementary in foreign/local status.
        # If the selected teacher is foreign, prefer Vietnamese (non-foreign) co-teachers, but if none exist,
        # fall back to include same-type to avoid missing names due to data inconsistencies.
        selected_is_foreign = bool(teacher_exists.is_foreign)
        for l, c, t in others:
            if l is None or c is None or t is None:
                continue
            k = (c.class_id, l.week, l.day, l.start_time, l.end_time)
            candidate_is_foreign = bool(getattr(t, 'is_foreign', False))
            if selected_is_foreign:
                if not candidate_is_foreign:
                    co_map.setdefault(k, []).append(t.name)
            else:
                if candidate_is_foreign:
                    co_map.setdefault(k, []).append(t.name)
        # If any slot ended up with no co-teachers due to strict filtering,
        # populate with all other names for that slot as a fallback.
        if others:
            by_key_all: Dict[Tuple[int, int, str, str, str], List[str]] = {}
            for l, c, t in others:
                if l is None or c is None or t is None:
                    continue
                k = (c.class_id, l.week, l.day, l.start_time, l.end_time)
                by_key_all.setdefault(k, []).append(t.name)
            for k, all_names in by_key_all.items():
                if not co_map.get(k):
                    co_map[k] = all_names
    else:
        co_map = {}

    lessons = _build_lessons_from_rows(rows, co_map=co_map, exclude_teacher=teacher_exists.name, viewing_teacher_id=teacher_id)
    # Backfill legacy "week" if it's missing to satisfy old consumers
    for lesson in lessons:
        if getattr(lesson, 'week', None) is None and getattr(lesson, 'week_number', None) is not None:
            lesson.week = lesson.week_number
    unique_lessons = _deduplicate_lessons(lessons)
    # Preserve co-teachers even when not grouped (if duplicates had different co lists)
    if not grouped:
        # Collapse duplicates but merge co-teachers
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

    return group_consecutive_lessons(unique_lessons)

@app.get("/class/{class_id}", response_model=List[LessonOut])
def get_class_schedule(
    class_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> List[LessonOut]:
    """Get schedule for a specific class"""
    # Validate class exists
    class_exists = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    ensure_demo_class_access(class_exists, current_user)
    if not class_exists:
        raise HTTPException(404, f"Class with id {class_id} not found")
    
    rows = _get_schedule_rows(db, current_user=current_user, class_id=class_id, week=week, day=day, campus=campus)
    
    # If no rows, return an empty list (better UX for frontend)
    if not rows:
        return []
    
    lessons = _build_lessons_from_rows(rows)
    unique_lessons = _deduplicate_lessons(lessons)
    
    return group_consecutive_lessons(unique_lessons) if grouped else unique_lessons


# Teacher Management Endpoints
@app.get("/teachers", response_model=List[TeacherOut])
def list_teachers(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role)
):
    """List all teachers with optional filtering"""
    try:
        query = apply_demo_scope_to_teacher_query(db.query(Teacher), current_user)
        
        if search:
            query = query.filter(Teacher.name.ilike(f"%{search}%"))
        if is_active is not None:
            query = query.filter(Teacher.is_active == is_active)
        
        teachers = query.all()
    except Exception as e:
        logger.error(f"Error querying teachers: {e}")
        # Fallback: return basic teacher info without optional fields
        query = apply_demo_scope_to_teacher_query(
            db.query(Teacher.teacher_id, Teacher.name, Teacher.is_foreign, Teacher.is_active),
            current_user,
            Teacher,
        )
        
        if search:
            query = query.filter(Teacher.name.ilike(f"%{search}%"))
        if is_active is not None:
            query = query.filter(Teacher.is_active == is_active)
        
        teacher_rows = query.all()
        # Convert to Teacher objects
        teachers = []
        for row in teacher_rows:
            teacher = Teacher()
            teacher.teacher_id = row.teacher_id
            teacher.name = row.name
            teacher.is_foreign = row.is_foreign
            teacher.is_active = row.is_active
            teachers.append(teacher)
    
    # Count lessons for each teacher
    result = []
    for teacher in teachers:
        # Skip if teacher is None (safety check)
        if teacher is None:
            logger.warning("Skipping None teacher object")
            continue
            
        lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher.teacher_id).count()
        result.append(TeacherOut(
            teacher_id=teacher.teacher_id,
            name=teacher.name,
            email=getattr(teacher, 'email', None),
            phone=getattr(teacher, 'phone', None),
            specialization=getattr(teacher, 'specialization', None),
            is_active=teacher.is_active,
            lesson_count=lesson_count
        ))
    
    return result

@app.post("/teachers", response_model=TeacherOut)
def create_teacher(
    teacher_data: TeacherCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Create a new teacher"""
    teacher_name = demo_teacher_name(teacher_data.name, current_user)
    # Check if teacher with same name already exists
    existing = db.query(Teacher).filter(Teacher.name == teacher_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teacher with this name already exists")
    
    teacher = Teacher(
        teacher_id=next_teacher_id(db),
        name=teacher_name,
        email=teacher_data.email,
        phone=teacher_data.phone,
        specialization=teacher_data.specialization,
        is_active=teacher_data.is_active,
        is_foreign=False  # Default for manually created teachers
    )
    
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    
    return TeacherOut(
        teacher_id=teacher.teacher_id,
        name=teacher.name,
        email=teacher.email,
        phone=teacher.phone,
        specialization=teacher.specialization,
        is_active=teacher.is_active,
        lesson_count=0
    )

@app.get("/teachers/{teacher_id}", response_model=TeacherOut)
def get_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role)
):
    """Get a specific teacher"""
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    ensure_demo_teacher_access(teacher, current_user)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    
    return TeacherOut(
        teacher_id=teacher.teacher_id,
        name=teacher.name,
        email=teacher.email,
        phone=teacher.phone,
        specialization=teacher.specialization,
        is_active=teacher.is_active,
        lesson_count=lesson_count
    )

@app.put("/teachers/{teacher_id}", response_model=TeacherOut)
def update_teacher(
    teacher_id: int,
    teacher_data: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Update a teacher"""
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    ensure_demo_teacher_access(teacher, current_user)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Check if new name conflicts with existing teacher
    updated_name = demo_teacher_name(teacher_data.name, current_user) if teacher_data.name else None
    if updated_name and updated_name != teacher.name:
        existing = db.query(Teacher).filter(Teacher.name == updated_name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Teacher with this name already exists")
    
    # Update fields
    for field, value in teacher_data.dict(exclude_unset=True).items():
        if field == "name":
            value = demo_teacher_name(value, current_user)
        setattr(teacher, field, value)
    
    db.commit()
    db.refresh(teacher)
    
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    
    return TeacherOut(
        teacher_id=teacher.teacher_id,
        name=teacher.name,
        email=teacher.email,
        phone=teacher.phone,
        specialization=teacher.specialization,
        is_active=teacher.is_active,
        lesson_count=lesson_count
    )

@app.delete("/teachers/{teacher_id}")
def delete_teacher(
    teacher_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Delete a teacher (with safety checks)"""
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    ensure_demo_teacher_access(teacher, current_user)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Check for existing lessons
    lesson_count = db.query(Lesson).filter(Lesson.teacher_id == teacher_id).count()
    if lesson_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete teacher with {lesson_count} assigned lessons. Use force=true to override."
        )
    
    # If forced, deactivate instead of deleting to preserve data integrity
    if lesson_count > 0 and force:
        teacher.is_active = False
        db.commit()
        return {"message": f"Teacher deactivated (had {lesson_count} lessons)"}
    else:
        db.delete(teacher)
        db.commit()
        return {"message": "Teacher deleted successfully"}

# Class Management Endpoints
@app.get("/classes", response_model=List[ClassOut])
def list_classes(
    search: Optional[str] = None,
    campus: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role)
):
    """List all classes with optional filtering"""
    query = apply_demo_scope_to_class_query(db.query(ClassModel), current_user)
    
    if search:
        query = query.filter(
            or_(
                ClassModel.code_new.ilike(f"%{search}%"),
                ClassModel.code_old.ilike(f"%{search}%"),
                ClassModel.name.ilike(f"%{search}%")
            )
        )
    if campus:
        query = query.filter(ClassModel.campus_name.ilike(f"%{campus}%"))
    if is_active is not None:
        query = query.filter(ClassModel.is_active == is_active)
    
    classes = query.all()
    
    # Count lessons for each class
    result = []
    for cls in classes:
        # Skip if class is None (safety check)
        if cls is None:
            logger.warning("Skipping None class object")
            continue
            
        lesson_count = db.query(Lesson).filter(Lesson.class_id == cls.class_id).count()
        level_value = None
        if getattr(cls, "level", None) is not None:
            level_value = str(cls.level)

        campus_value = cls.campus_name if cls.campus_name is not None else ""

        result.append(ClassOut(
            class_id=cls.class_id,
            code_new=cls.code_new,
            code_old=cls.code_old,
            campus_name=campus_value,
            level=level_value,
            capacity=cls.capacity,
            is_active=cls.is_active,
            lesson_count=lesson_count
        ))
    
    return result

@app.post("/classes", response_model=ClassOut)
def create_class(
    class_data: ClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Create a new class"""
    code_new = demo_class_code(class_data.code_new, current_user)
    code_old = demo_class_code(class_data.code_old, current_user)
    # Check for duplicate codes
    if code_new:
        existing = db.query(ClassModel).filter(ClassModel.code_new == code_new).first()
        if existing:
            raise HTTPException(status_code=400, detail="Class with this new code already exists")
    
    if code_old:
        existing = db.query(ClassModel).filter(ClassModel.code_old == code_old).first()
        if existing:
            raise HTTPException(status_code=400, detail="Class with this old code already exists")
    
    cls = ClassModel(
        class_id=next_class_id(db),
        code_new=code_new,
        code_old=code_old,
        campus_name=class_data.campus_name,
        level=class_data.level,
        capacity=class_data.capacity,
        is_active=class_data.is_active,
        name=code_new or code_old or f"Class {class_data.campus_name}"
    )
    
    db.add(cls)
    db.commit()
    db.refresh(cls)
    
    return ClassOut(
        class_id=cls.class_id,
        code_new=cls.code_new,
        code_old=cls.code_old,
        campus_name=cls.campus_name,
        level=cls.level,
        capacity=cls.capacity,
        is_active=cls.is_active,
        lesson_count=0
    )

@app.get("/classes/{class_id}", response_model=ClassOut)
def get_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role)
):
    """Get a specific class"""
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    ensure_demo_class_access(cls, current_user)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    
    return ClassOut(
        class_id=cls.class_id,
        code_new=cls.code_new,
        code_old=cls.code_old,
        campus_name=cls.campus_name,
        level=cls.level,
        capacity=cls.capacity,
        is_active=cls.is_active,
        lesson_count=lesson_count
    )

@app.put("/classes/{class_id}", response_model=ClassOut)
def update_class(
    class_id: int,
    class_data: ClassUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Update a class"""
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    ensure_demo_class_access(cls, current_user)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check for duplicate codes (excluding current class)
    updated_code_new = demo_class_code(class_data.code_new, current_user) if class_data.code_new else None
    updated_code_old = demo_class_code(class_data.code_old, current_user) if class_data.code_old else None
    if updated_code_new and updated_code_new != cls.code_new:
        existing = db.query(ClassModel).filter(
            ClassModel.code_new == updated_code_new,
            ClassModel.class_id != class_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Class with this new code already exists")
    
    if updated_code_old and updated_code_old != cls.code_old:
        existing = db.query(ClassModel).filter(
            ClassModel.code_old == updated_code_old,
            ClassModel.class_id != class_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Class with this old code already exists")
    
    # Update fields
    for field, value in class_data.dict(exclude_unset=True).items():
        if field in {"code_new", "code_old"}:
            value = demo_class_code(value, current_user)
        setattr(cls, field, value)
    
    # Update name if codes changed
    if class_data.code_new or class_data.code_old:
        cls.name = cls.code_new or cls.code_old or cls.name
    
    db.commit()
    db.refresh(cls)
    
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    
    return ClassOut(
        class_id=cls.class_id,
        code_new=cls.code_new,
        code_old=cls.code_old,
        campus_name=cls.campus_name,
        level=cls.level,
        capacity=cls.capacity,
        is_active=cls.is_active,
        lesson_count=lesson_count
    )

@app.delete("/classes/{class_id}")
def delete_class(
    class_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Delete a class (with safety checks)"""
    cls = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    ensure_demo_class_access(cls, current_user)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check for existing lessons
    lesson_count = db.query(Lesson).filter(Lesson.class_id == class_id).count()
    if lesson_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete class with {lesson_count} assigned lessons. Use force=true to override."
        )
    
    # If forced, deactivate instead of deleting to preserve data integrity
    if lesson_count > 0 and force:
        cls.is_active = False
        db.commit()
        return {"message": f"Class deactivated (had {lesson_count} lessons)"}
    else:
        db.delete(cls)
        db.commit()
        return {"message": "Class deleted successfully"}

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/upload")
async def upload_schedule(
    file: UploadFile = File(...), 
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Upload and process Excel schedule file"""
    # Validate file
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "File must be Excel format (.xlsx or .xls)")
    
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Max size: {MAX_FILE_SIZE // 1024 // 1024}MB")
    
    try:
        os.makedirs("data", exist_ok=True)
        dest = os.path.join("data", "Schedule.xlsx")
        
        with open(dest, "wb") as f:
            f.write(content)
        
        logger.info(f"Uploaded file saved: {dest}")
        
        def run_import() -> None:
            try:
                result = subprocess.run(
                    ["python", "inspect_schedule.py"], 
                    capture_output=True, text=True, timeout=300
                )
                if result.returncode == 0:
                    logger.info("Import completed successfully")
                else:
                    logger.error(f"Import failed: {result.stderr}")
            except subprocess.TimeoutExpired:
                logger.error("Import timed out after 5 minutes")
            except Exception as e:
                logger.error(f"Import error: {e}")
        
        background_tasks.add_task(run_import)
        return {"status": "queued", "saved_to": dest, "message": "Import started in background"}
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(500, "Upload failed")
