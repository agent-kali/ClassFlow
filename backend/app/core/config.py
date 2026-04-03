"""ClassFlow backend configuration.

All environment variables are typed via pydantic-settings.
No os.environ should appear anywhere else in the app.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List, Optional
from enum import Enum as PyEnum


class Environment(str, PyEnum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TEST = "test"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = Field(default="sqlite:///data/schedule_test.db")

    # Security
    JWT_SECRET_KEY: Optional[str] = Field(default=None)
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440)  # 24 hours

    # Environment
    ENVIRONMENT: str = Field(default="development")
    ALLOW_PRODUCTION_IMPORT: bool = Field(default=False)

    # CORS
    CORS_EXTRA_ORIGINS: str = Field(default="")

    # File upload
    MAX_FILE_SIZE: int = Field(default=10 * 1024 * 1024)  # 10MB

    # Bootstrap admin
    ADMIN_BOOTSTRAP_USERNAME: Optional[str] = Field(default=None)
    ADMIN_BOOTSTRAP_PASSWORD: Optional[str] = Field(default=None)
    ADMIN_BOOTSTRAP_EMAIL: Optional[str] = Field(default=None)

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in {"production", "prod"}

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in {
            "development", "dev", "local", "test", "testing",
        }

    @property
    def resolved_jwt_secret(self) -> str:
        """Return JWT secret, raising in production if not set."""
        secret = self.JWT_SECRET_KEY
        if secret:
            return secret
        if self.is_development:
            return "dev-only-secret-change-me"
        raise RuntimeError(
            "JWT_SECRET_KEY environment variable must be set in production."
        )

    @property
    def cors_origins(self) -> List[str]:
        extra = [
            o.strip()
            for o in self.CORS_EXTRA_ORIGINS.split(",")
            if o.strip()
        ]
        return [
            f"http://{host}:{port}"
            for host in ("localhost", "127.0.0.1")
            for port in range(5173, 5181)
        ] + extra


settings = Settings()
