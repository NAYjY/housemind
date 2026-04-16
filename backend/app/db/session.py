"""
app/db/session.py — HouseMind
AsyncSession factory with production-tuned connection pool.

Pool sizing (Railway Starter — max 25 PG connections):
  pool_size=5, max_overflow=10 → 15 max per worker
  With 1-2 uvicorn workers → 15-30 connections max
  pool_recycle=1800 → recycle every 30 min (Railway idles PG at 1hr)
  pool_pre_ping=True → re-validate before use (handles Railway restarts)
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

_is_test = settings.ENVIRONMENT in ("local", "test")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=_is_test,
    future=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a session, commits on success, rolls back on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connection() -> None:
    """Readiness probe — raises if DB unreachable."""
    async with AsyncSessionLocal() as session:
        await session.execute(text("SELECT 1"))
