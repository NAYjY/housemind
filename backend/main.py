"""
main.py — HouseMind
FastAPI application entry point.

Start locally:
  uvicorn main:app --reload --port 8000

Railway deploys via Procfile:
  web: uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import RequestLoggingMiddleware, configure_logging, get_logger
from app.core.sentry import init_sentry
from app.db.session import check_db_connection

logger = get_logger(__name__)

_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown hooks."""
    configure_logging()
    init_sentry()
    logger.info("housemind.startup", environment=settings.ENVIRONMENT)

    # Verify DB is reachable before accepting traffic
    try:
        await check_db_connection()
        logger.info("db.connection.ok")
    except Exception as exc:
        logger.error("db.connection.failed", exc_info=exc)
        raise

    yield

    logger.info("housemind.shutdown")


app = FastAPI(
    title="HouseMind API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

# ── Exception handlers ────────────────────────────────────────────────────────

register_exception_handlers(app)

# ── Routers ───────────────────────────────────────────────────────────────────

from app.api.v1 import router as v1_router  # noqa: E402

app.include_router(v1_router, prefix="/v1")


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"])
async def health() -> dict:
    return {"status": "ok", "uptime_seconds": round(time.time() - _start_time, 1)}


@app.get("/health/ready", tags=["ops"])
async def readiness() -> dict:
    """Deeper readiness probe — checks DB connectivity."""
    await check_db_connection()
    return {"status": "ready"}