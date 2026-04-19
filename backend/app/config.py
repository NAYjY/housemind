"""
app/config.py — HouseMind
Pydantic Settings. All env var names are the canonical DevOps names
(see infra/env-vars-reference.toml). Do not add aliases here —
change the env var name at the source instead.

Key alignment fixes applied here vs the Backend agent's first draft:
  - JWT_SECRET → SECRET_KEY          (DevOps canonical name)
  - AWS_REGION → AWS_DEFAULT_REGION  (standard AWS SDK name)
  - S3_BUCKET_PRODUCTS/PROJECTS      → S3_BUCKET_NAME (single bucket, prefix strategy)
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # set to "production" in prod
    #SECRET_KEY: str = "dev-secret-change-in-production-please"
    #ENVIRONMENT: str = "development"   # set to "production" in prod

    # ── Runtime environment ────────────────────────────────────────────────
    ENVIRONMENT: str = "local"

    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:5432/housemind

    # ── Auth / JWT ─────────────────────────────────────────────────────────
    # SECRET_KEY is the canonical DevOps name. Min 64 random bytes, base64url.
    SECRET_KEY: str
    # Which JWT claim to use as the stable user identifier.
    # "user_id" (UUID, preferred) or "email". Align with magic-link issuance.
    JWT_USER_ID_FIELD: str = "user_id"
    JWT_ALGORITHM: str = "HS256"
    # Access token lifetime in minutes
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # ── AWS / S3 ───────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_DEFAULT_REGION: str = "ap-southeast-1"
    # Single bucket; distinguish assets by key prefix:
    #   products/thumbnails/<id>.jpg
    #   projects/<project_id>/images/<id>.jpg
    S3_BUCKET_NAME: str

    # ── CORS ───────────────────────────────────────────────────────────────
    # Comma-separated origins: "https://housemind.app,https://staging.housemind.app"
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Sentry ─────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── Logging ────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance. Import this — do not import Settings directly."""
    return Settings()


# Module-level alias for convenience: `from app.config import settings`
settings = get_settings()
