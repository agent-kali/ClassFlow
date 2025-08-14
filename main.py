from fastapi import FastAPI, Depends, HTTPException
from fastapi import UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import os
import subprocess

# Use the same database as the import script
DATABASE_URL = "sqlite:///data/schedule_test.db"

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

# Сериализация результатов
class LessonOut(BaseModel):
    week: int
    day: str
    start_time: str
    end_time: str
    class_code: str
    teacher_name: str
    campus_name: str
    room: Optional[str] = None
    duration_minutes: int  # Added for convenience

    class Config:
        orm_mode = True

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure useful indexes exist
@app.on_event("startup")
def ensure_indexes() -> None:
    with engine.connect() as conn:
        # Ensure 'room' column exists (SQLite allows ADD COLUMN)
        try:
            res = conn.execute(text("PRAGMA table_info(lesson)")).fetchall()
            has_room = any(getattr(r, "name", None) == "room" or (isinstance(r, tuple) and len(r) > 1 and r[1] == "room") for r in res)
            if not has_room:
                conn.execute(text("ALTER TABLE lesson ADD COLUMN room TEXT"))
        except Exception:
            # If the table doesn't exist yet, ignore; importer will create it
            pass
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_lesson_teacher_week_day_time ON lesson(teacher_id, week, day, start_time, end_time)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_lesson_class_week_day_time ON lesson(class_id, week, day, start_time, end_time)"))
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_lesson_room ON lesson(room)"))
        except Exception:
            # Skip if column not present (e.g., before first import)
            pass
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uniq_lesson ON lesson(class_id, teacher_id, week, day, start_time, end_time)"))
        except Exception:
            pass
        conn.commit()

# DB session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def group_consecutive_lessons(lessons):
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
                first = current_group[0]
                last = current_group[-1]
                
                # Calculate duration
                start_time = datetime.strptime(first.start_time, '%H:%M')
                end_time = datetime.strptime(last.end_time, '%H:%M')
                duration = int((end_time - start_time).total_seconds() / 60)
                
                grouped.append(LessonOut(
                    week=first.week,
                    day=first.day,
                    start_time=first.start_time,
                    end_time=last.end_time,
                    class_code=first.class_code,
                    teacher_name=first.teacher_name,
                    campus_name=first.campus_name,
                    duration_minutes=duration
                ))
            
            current_group = [lesson]
    
    # Don't forget the last group
    if current_group:
        first = current_group[0]
        last = current_group[-1]
        
        start_time = datetime.strptime(first.start_time, '%H:%M')
        end_time = datetime.strptime(last.end_time, '%H:%M')
        duration = int((end_time - start_time).total_seconds() / 60)
        
        grouped.append(LessonOut(
            week=first.week,
            day=first.day,
            start_time=first.start_time,
            end_time=last.end_time,
            class_code=first.class_code,
            teacher_name=first.teacher_name,
            campus_name=first.campus_name,
            duration_minutes=duration
        ))
    
    return grouped

@app.get("/my/{teacher_id}", response_model=List[LessonOut])
def get_teacher_schedule(
    teacher_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    db: Session = Depends(get_db)
):
    query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.teacher_id == teacher_id)
    )

    if week is not None:
        query = query.filter(Lesson.week == week)
    if day is not None:
        query = query.filter(Lesson.day == day)
    if campus is not None:
        query = query.filter(ClassModel.campus_name == campus)

    rows = query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()

    if not rows:
        raise HTTPException(404, f"No lessons found for teacher_id={teacher_id}")
    
    lessons = [
        LessonOut(
            week=lesson.week,
            day=lesson.day,
            start_time=lesson.start_time,
            end_time=lesson.end_time,
            class_code=(cls.code_new or cls.code_old),
            teacher_name=teacher.name,
            campus_name=cls.campus_name,
            room=getattr(lesson, 'room', None),
            duration_minutes=30  # Each slot is 30 minutes
        )
        for lesson, cls, teacher in rows
    ]

    # Deduplicate before returning
    seen, uniq = set(), []
    for item in lessons:
        key = (item.week, item.day, item.start_time, item.end_time, item.class_code, item.teacher_name, item.campus_name)
        if key not in seen:
            seen.add(key)
            uniq.append(item)
    
    if grouped:
        return group_consecutive_lessons(uniq)
    
    return uniq

@app.get("/class/{class_id}", response_model=List[LessonOut])
def get_class_schedule(
    class_id: int,
    week: Optional[int] = None,
    day: Optional[str] = None,
    campus: Optional[str] = None,
    grouped: bool = False,
    db: Session = Depends(get_db)
):
    query = (
        db.query(Lesson, ClassModel, Teacher)
        .join(ClassModel, Lesson.class_id == ClassModel.class_id)
        .join(Teacher, Lesson.teacher_id == Teacher.teacher_id)
        .filter(Lesson.class_id == class_id)
    )

    if week is not None:
        query = query.filter(Lesson.week == week)
    if day is not None:
        query = query.filter(Lesson.day == day)
    if campus is not None:
        query = query.filter(ClassModel.campus_name == campus)

    rows = query.order_by(Lesson.week, Lesson.day, Lesson.start_time).all()

    if not rows:
        raise HTTPException(404, f"No lessons found for class_id={class_id}")
    
    lessons = [
        LessonOut(
            week=lesson.week,
            day=lesson.day,
            start_time=lesson.start_time,
            end_time=lesson.end_time,
            class_code=(cls.code_new or cls.code_old),
            teacher_name=teacher.name,
            campus_name=cls.campus_name,
            room=getattr(lesson, 'room', None),
            duration_minutes=30  # Each slot is 30 minutes
        )
        for lesson, cls, teacher in rows
    ]

    # Deduplicate before returning
    seen, uniq = set(), []
    for item in lessons:
        key = (item.week, item.day, item.start_time, item.end_time, item.class_code, item.teacher_name, item.campus_name)
        if key not in seen:
            seen.add(key)
            uniq.append(item)
    
    if grouped:
        return group_consecutive_lessons(uniq)
    
    return uniq

# Additional endpoints for debugging
@app.get("/teachers")
def list_teachers(db: Session = Depends(get_db)):
    teachers = db.query(Teacher).all()
    return [{"teacher_id": t.teacher_id, "name": t.name, "is_foreign": t.is_foreign} for t in teachers]

@app.get("/classes")
def list_classes(db: Session = Depends(get_db)):
    classes = db.query(ClassModel).all()
    return [{"class_id": c.class_id, "name": c.name, "code_new": c.code_new, "code_old": c.code_old} for c in classes]

@app.post("/upload")
async def upload_schedule(file: UploadFile = File(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    os.makedirs("data", exist_ok=True)
    dest = os.path.join("data", "Schedule.xlsx")
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    def run_import() -> None:
        try:
            subprocess.run(["python", "inspect_schedule.py"], check=False)
        except Exception:
            pass

    background_tasks.add_task(run_import)
    return {"status": "queued", "saved_to": dest}
