"""
HouseMind FastAPI application entry point.

Bootstrap order (order matters — Sentry first, then logging, then app):
  1. Sentry    — captures startup errors before anything else
  2. Logging   — structlog configured, RequestLoggingMiddleware registered
  3. App       — CORS, exception handlers, routers
"""
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.sentry import init_sentry

# ── 1. Sentry must initialise before anything else ────────────────────────────
init_sentry()

# ── 2. Logging ────────────────────────────────────────────────────────────────
from app.core.logging import configure_logging, RequestLoggingMiddleware, get_logger

configure_logging()
logger = get_logger(__name__)


# ── 3. Lifespan ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.started_at = time.time()
    logger.info("app.startup", environment=os.getenv("ENVIRONMENT", "local"))
    yield
    logger.info("app.shutdown")


# ── 4. App factory ────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    app = FastAPI(
        title="HouseMind API",
        version="0.1.0",
        docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # ── Middleware (order: outermost → innermost) ──────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    # ── Exception handlers ─────────────────────────────────────────────────
    from app.core.exceptions import register_exception_handlers
    register_exception_handlers(app)

    # ── Health endpoints ───────────────────────────────────────────────────
    @app.get("/health", tags=["ops"], include_in_schema=False)
    async def health() -> JSONResponse:
        """Liveness probe — UptimeRobot pings every 5 min."""
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "uptime_seconds": round(time.time() - app.state.started_at, 1),
                "environment": os.getenv("ENVIRONMENT", "local"),
                "version": app.version,
            },
        )

    @app.get("/health/ready", tags=["ops"], include_in_schema=False)
    async def health_ready() -> JSONResponse:
        """Readiness probe — checks DB connectivity. Used post-deploy."""
        from app.db.session import check_db_connection

        checks: dict[str, str] = {}
        status_code = 200
        try:
            await check_db_connection()
            checks["database"] = "ok"
        except Exception as exc:
            checks["database"] = f"error: {exc}"
            status_code = 503
            logger.error("health.ready.db_failed", exc_info=exc)

        return JSONResponse(
            status_code=status_code,
            content={
                "status": "ok" if status_code == 200 else "degraded",
                "checks": checks,
            },
        )

    # ── Routers ────────────────────────────────────────────────────────────
    from app.api.v1 import router as api_v1_router
    app.include_router(api_v1_router, prefix="/v1")

    return app


app = create_app()
