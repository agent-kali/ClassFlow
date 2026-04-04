"""Auth routes: POST /auth/login, demo login, user management."""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.core.security import (
    create_access_token, get_current_user, hash_password,
    maybe_upgrade_password_hash, require_admin, verify_password,
    _is_legacy_hash,
)
from backend.app.models.db_models import Teacher, User, UserRole
from backend.app.models.schemas import Token, UserCreate, UserLogin, UserOut
from backend.app.services.demo_service import (
    ensure_demo_data, get_or_create_demo_user, reset_demo_data,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")


@router.post("/login", response_model=Token, summary="Authenticate user")
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_credentials.username).first()
    if not user or not user.is_active or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    if _is_legacy_hash(user.hashed_password):
        maybe_upgrade_password_hash(user, user_credentials.password, db)
    access_token = create_access_token({"sub": user.username})
    return Token(access_token=access_token, token_type="bearer", user=UserOut.model_validate(user))


@router.post("/demo-login", response_model=Token, summary="Log in as demo manager")
def demo_login(db: Session = Depends(get_db)):
    """Provision (or fetch) a shared demo manager account, ensure demo data
    exists, and return a valid token.  No credentials required."""
    try:
        user = get_or_create_demo_user(db)
        ensure_demo_data(db)
        access_token = create_access_token({"sub": user.username})
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=UserOut.model_validate(user),
        )
    except Exception as exc:
        logger.exception("Demo login failed")
        raise HTTPException(500, f"Demo login failed: {exc}")


@router.post("/demo-reset", summary="Reset demo dataset")
def demo_reset(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete all demo records and regenerate a fresh dataset.
    Requires admin privileges."""
    counts = reset_demo_data(db)
    return {"message": "Demo data reset successfully", **counts}


@router.get("/me", response_model=UserOut, summary="Current user info")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=List[UserOut], summary="List users (admin)")
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return db.query(User).all()


@router.post("/register", response_model=UserOut, summary="Register user (admin)")
def register(user_data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(400, "Username already exists")
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(400, "Email already exists")
    if user_data.teacher_id:
        if not db.query(Teacher).filter(Teacher.teacher_id == user_data.teacher_id).first():
            raise HTTPException(400, f"Teacher with id {user_data.teacher_id} not found")
    new_user = User(
        username=user_data.username, email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role, teacher_id=user_data.teacher_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/users", response_model=UserOut, summary="Create user (admin)")
def create_user(user_data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(400, "Username already registered")
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(400, "Email already registered")
    if user_data.teacher_id:
        if not db.query(Teacher).filter(Teacher.teacher_id == user_data.teacher_id).first():
            raise HTTPException(400, f"Teacher with id {user_data.teacher_id} not found")
    user = User(
        username=user_data.username, email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role, teacher_id=user_data.teacher_id, is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut, summary="Update user (admin)")
def update_user(user_id: int, user_data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.username = user_data.username
    user.email = user_data.email
    user.role = user_data.role
    user.teacher_id = user_data.teacher_id
    if user_data.password:
        user.hashed_password = hash_password(user_data.password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", summary="Delete user (admin)")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.user_id == current_user.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}
