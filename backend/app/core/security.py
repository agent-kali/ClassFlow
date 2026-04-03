"""JWT authentication and password hashing.

Exposes: hash_password, verify_password, create_access_token,
         get_current_user, require_admin
"""

import hashlib
import logging
from datetime import datetime, timedelta
from typing import List

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.db import get_db

logger = logging.getLogger(__name__)

security = HTTPBearer()
pwd_context = CryptContext(
    schemes=["bcrypt"], deprecated="auto", bcrypt__default_rounds=12
)


# ---------- password hashing ----------

def _is_legacy_hash(hash_value: str) -> bool:
    return ":" in (hash_value or "")


def _verify_legacy_password(password: str, hashed: str) -> bool:
    try:
        hash_part, salt = hashed.split(":", 1)
        return hashlib.sha256((password + salt).encode()).hexdigest() == hash_part
    except ValueError:
        return False


def hash_password(password: str) -> str:
    """Hash password using bcrypt via Passlib."""
    try:
        if len(password.encode("utf-8")) > 72:
            password = password[:72]
        return pwd_context.hash(password)
    except Exception as e:
        logger.error("Error hashing password: %s", e)
        import secrets
        salt = secrets.token_hex(16)
        return hashlib.sha256((password + salt).encode()).hexdigest() + ":" + salt


def verify_password(password: str, hashed: str) -> bool:
    """Verify password, supporting legacy SHA-256 hashes."""
    if not hashed:
        return False
    if _is_legacy_hash(hashed):
        return _verify_legacy_password(password, hashed)
    try:
        if len(password.encode("utf-8")) > 72:
            password = password[:72]
        return pwd_context.verify(password, hashed)
    except Exception as e:
        logger.error("Error verifying password: %s", e)
        return False


def maybe_upgrade_password_hash(user, plain_password: str, db: Session) -> None:
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


# ---------- JWT ----------

def create_access_token(data: dict) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.resolved_jwt_secret, algorithm=settings.JWT_ALGORITHM)


# ---------- Dependencies ----------

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """FastAPI dependency: extract User from JWT token."""
    from backend.app.models.db_models import User  # avoid circular import

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.resolved_jwt_secret,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def _require_role(required_roles):
    """Factory for role-checking dependencies."""
    from backend.app.models.db_models import UserRole  # avoid circular import

    def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {[r.value for r in required_roles]}",
            )
        return current_user

    return role_checker


def _build_role_deps():
    """Build role dependencies lazily to avoid import-time circular deps."""
    from backend.app.models.db_models import UserRole
    return {
        "require_admin": _require_role([UserRole.ADMIN]),
        "require_manager_or_admin": _require_role([UserRole.MANAGER, UserRole.ADMIN]),
        "require_any_role": _require_role([UserRole.TEACHER, UserRole.MANAGER, UserRole.ADMIN]),
    }


class _RoleDeps:
    """Lazy accessor for role dependencies to avoid circular imports."""
    _cache = None

    @classmethod
    def _load(cls):
        if cls._cache is None:
            cls._cache = _build_role_deps()
        return cls._cache

    @classmethod
    def require_admin(cls):
        return cls._load()["require_admin"]

    @classmethod
    def require_manager_or_admin(cls):
        return cls._load()["require_manager_or_admin"]

    @classmethod
    def require_any_role(cls):
        return cls._load()["require_any_role"]


require_admin = _RoleDeps.require_admin()
require_manager_or_admin = _RoleDeps.require_manager_or_admin()
require_any_role = _RoleDeps.require_any_role()
