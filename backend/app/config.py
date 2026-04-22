"""
app/config.py — HouseMind

SEC-09 fix: JWT_ALGORITHM removed from Settings entirely — hardcoded to HS256
  in auth.py.  An env-configurable algorithm allows setting "none" which
  disables signature verification.  The fix is to never read it from env.

SEC-20 fix: BCRYPT_ROUNDS added — explicit, auditable cost factor.

SEC-24 fix: HEALTH_SECRET added — /health/ready requires this header so
  the deep readiness probe is not reachable by external scanners.
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

    # ── Runtime environment ────────────────────────────────────────────────
    ENVIRONMENT: str = "local"

    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:5432/housemind

    # ── Auth / JWT ─────────────────────────────────────────────────────────
    # SECRET_KEY: min 64 random bytes, base64url encoded.
    SECRET_KEY: str
    # JWT_ALGORITHM is intentionally NOT here.  It is hardcoded to "HS256"
    # in auth.py.  Never make the signing algorithm configurable via env.
    JWT_USER_ID_FIELD: str = "user_id"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # ── Auth / bcrypt ─────────────────────────────────────────────────────
    # SEC-20: explicit cost factor (OWASP minimum is 10, recommended 12).
    BCRYPT_ROUNDS: int = 12

    # ── AWS / S3 ───────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_DEFAULT_REGION: str = "ap-southeast-1"
    S3_BUCKET_NAME: str

    # ── CORS ───────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Health probe ───────────────────────────────────────────────────────
    # SEC-24: /health/ready requires X-Health-Secret: <this value>.
    # Leave empty in local dev to disable the check.
    # Set to a strong random string in staging/production.
    HEALTH_SECRET: str = ""

    # ── Email ─────────────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Sentry ────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── Logging ───────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
