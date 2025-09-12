from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import os
import subprocess
import logging

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/schedule_test.db")

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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

class ClassModel(Base):
    __tablename__ = "class"
    class_id = Column(Integer, primary_key=True, index=True)
    campus_name = Column(String)       # from import, if needed
    code_old = Column(String)
    code_new = Column(String)
    name = Column(String)

class Lesson(Base):
    __tablename__ = "lesson"
    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("class.class_id"))
    teacher_id = Column(Integer, ForeignKey("teacher.teacher_id"))
    week = Column(Integer)
    day = Column(String)
    start_time = Column(String)
    end_time = Column(String)
    room = Column(String)

# Pydantic models
class LessonOut(BaseModel):
    week: int
    day: str
    start_time: str
    end_time: str
    class_code: str
    teacher_name: str
    campus_name: str
    room: Optional[str] = None
    co_teachers: Optional[List[str]] = None
    duration_minutes: int  # Added for convenience

    class Config:
        from_attributes = True

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
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Remove duplicate lifespan definition

def ensure_indexes() -> None:
    """Ensure database schema and indexes exist"""
    try:
        with engine.connect() as conn:
            # Ensure 'room' column exists (SQLite allows ADD COLUMN)
            try:
                res = conn.execute(text("PRAGMA table_info(lesson)")).fetchall()
                has_room = any(
                    getattr(r, "name", None) == "room" or 
                    (isinstance(r, tuple) and len(r) > 1 and r[1] == "room") 
                    for r in res
                )
                if not has_room:
                    conn.execute(text("ALTER TABLE lesson ADD COLUMN room TEXT"))
                    logger.info("Added room column to lesson table")
            except Exception as e:
                logger.warning(f"Could not check/add room column: {e}")
            
            # Create indexes
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_lesson_teacher_week_day_time ON lesson(teacher_id, week, day, start_time, end_time)",
                "CREATE INDEX IF NOT EXISTS idx_lesson_class_week_day_time ON lesson(class_id, week, day, start_time, end_time)",
                "CREATE INDEX IF NOT EXISTS idx_lesson_room ON lesson(room)",
                "CREATE UNIQUE INDEX IF NOT EXISTS uniq_lesson ON lesson(class_id, teacher_id, week, day, start_time, end_time)"
            ]
            
            for idx_sql in indexes:
                try:
                    conn.execute(text(idx_sql))
                except Exception as e:
                    logger.warning(f"Could not create index: {e}")
            
            conn.commit()
            logger.info("Database indexes ensured")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

# DB session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
        week=first.week,
        day=first.day,
        start_time=first.start_time,
        end_time=last.end_time,
        class_code=first.class_code,
        teacher_name=first.teacher_name,
        campus_name=first.campus_name,
        room=first.room,
        co_teachers=merged_co or None,
        duration_minutes=duration
    )

def _build_lessons_from_rows(
    rows,
    co_map: Optional[Dict[Tuple[int, int, str, str, str], List[str]]] = None,
    exclude_teacher: Optional[str] = None,
) -> List[LessonOut]:
    """Convert DB rows to LessonOut objects, optionally attaching co-teachers"""
    items: List[LessonOut] = []
    norm_exclude = exclude_teacher.strip().casefold() if exclude_teacher else None
    for lesson, cls, teacher in rows:
        key = (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        co_list = None
        if co_map is not None and key in co_map:
            names = co_map[key]
            if norm_exclude is not None:
                names = [n for n in names if n.strip().casefold() != norm_exclude]
            co_list = names or None

        items.append(
            LessonOut(
                week=lesson.week,
                day=lesson.day,
                start_time=lesson.start_time,
                end_time=lesson.end_time,
                class_code=(cls.code_new or cls.code_old),
                teacher_name=teacher.name,
                campus_name=cls.campus_name,
                room=getattr(lesson, 'room', None),
                co_teachers=co_list,
                duration_minutes=30,
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

@app.get("/my/{teacher_id}", response_model=List[LessonOut])
def get_teacher_schedule(
    teacher_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    db: Session = Depends(get_db)
) -> List[LessonOut]:
    """Get schedule for a specific teacher"""
    # Validate teacher exists
    teacher_exists = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher_exists:
        raise HTTPException(404, f"Teacher with id {teacher_id} not found")
    
    rows = _get_schedule_rows(db, teacher_id=teacher_id, week=week, day=day, campus=campus)
    
    # If no rows, return an empty list (better UX for frontend)
    if not rows:
        return []
    
    # Build co-teacher map for the same class/week/day/time slots
    # Gather keys from selected teacher's rows
    keys: List[Tuple[int, int, str, str, str]] = [
        (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        for lesson, cls, _ in rows
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
            .all()
        )
        co_map: Dict[Tuple[int, int, str, str, str], List[str]] = {}
        # Only attach co-teachers that are complementary in foreign/local status.
        # If the selected teacher is foreign, prefer Vietnamese (non-foreign) co-teachers, but if none exist,
        # fall back to include same-type to avoid missing names due to data inconsistencies.
        selected_is_foreign = bool(teacher_exists.is_foreign)
        for l, c, t in others:
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
                k = (c.class_id, l.week, l.day, l.start_time, l.end_time)
                by_key_all.setdefault(k, []).append(t.name)
            for k, all_names in by_key_all.items():
                if not co_map.get(k):
                    co_map[k] = all_names
    else:
        co_map = {}

    lessons = _build_lessons_from_rows(rows, co_map=co_map, exclude_teacher=teacher_exists.name)
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
    db: Session = Depends(get_db)
) -> List[LessonOut]:
    """Get schedule for a specific class"""
    # Validate class exists
    class_exists = db.query(ClassModel).filter(ClassModel.class_id == class_id).first()
    if not class_exists:
        raise HTTPException(404, f"Class with id {class_id} not found")
    
    rows = _get_schedule_rows(db, class_id=class_id, week=week, day=day, campus=campus)
    
    # If no rows, return an empty list (better UX for frontend)
    if not rows:
        return []
    
    lessons = _build_lessons_from_rows(rows)
    unique_lessons = _deduplicate_lessons(lessons)
    
    return group_consecutive_lessons(unique_lessons) if grouped else unique_lessons

def _get_schedule_rows(db: Session, teacher_id: Optional[int] = None, class_id: Optional[int] = None, 
                      week: Optional[int] = None, day: Optional[str] = None, campus: Optional[str] = None):
    """Common query logic for schedule endpoints"""
    query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
    )
    
    if teacher_id is not None:
        query = query.filter(Lesson.teacher_id == teacher_id)
    if class_id is not None:
        query = query.filter(Lesson.class_id == class_id)
    if week is not None:
        query = query.filter(Lesson.week == week)
    if day is not None:
        query = query.filter(Lesson.day == day)
    if campus is not None:
        query = query.filter(ClassModel.campus_name == campus)
    
    return query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()

# Utility endpoints
@app.get("/teachers")
def list_teachers(db: Session = Depends(get_db)):
    """List all teachers"""
    teachers = db.query(Teacher).all()
    return [
        {"teacher_id": t.teacher_id, "name": t.name, "is_foreign": t.is_foreign} 
        for t in teachers
    ]

@app.get("/classes")
def list_classes(db: Session = Depends(get_db)):
    """List all classes"""
    classes = db.query(ClassModel).all()
    return [
        {"class_id": c.class_id, "name": c.name, "code_new": c.code_new, "code_old": c.code_old} 
        for c in classes
    ]

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
