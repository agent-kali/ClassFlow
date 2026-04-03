"""Shared test fixtures — in-memory SQLite + TestClient."""

import os

# Force test environment BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-do-not-use-in-prod"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.db import Base, get_db
from backend.app.core.security import hash_password, create_access_token
from backend.app.models.db_models import User, UserRole, Teacher, ClassModel, Lesson, ImportLog
from backend.app.main import app

# StaticPool ensures all connections share the same in-memory database
TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def reset_db():
    """Re-create all tables for each test on the shared test engine."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def admin_user(db) -> User:
    user = User(
        username="admin",
        email="admin@test.com",
        hashed_password=hash_password("password"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def teacher_user(db) -> User:
    teacher = Teacher(name="Test Teacher", is_foreign=False, is_active=True)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)

    user = User(
        username="teacher1",
        email="teacher1@test.com",
        hashed_password=hash_password("password"),
        role=UserRole.TEACHER,
        is_active=True,
        teacher_id=teacher.teacher_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user) -> str:
    return create_access_token({"sub": admin_user.username})


@pytest.fixture
def teacher_token(teacher_user) -> str:
    return create_access_token({"sub": teacher_user.username})


@pytest.fixture
def auth_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def teacher_headers(teacher_token) -> dict:
    return {"Authorization": f"Bearer {teacher_token}"}


@pytest.fixture
def sample_teacher(db) -> Teacher:
    t = Teacher(name="Mr Smith", is_foreign=True, is_active=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture
def sample_class(db) -> ClassModel:
    c = ClassModel(campus_name="E1", code_old="E1-A1", code_new="E1-A1", name="Class A1", is_active=True)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
