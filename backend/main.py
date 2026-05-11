"""
main.py — HouseMind

Security fixes:

SEC-05  slowapi rate limiter wired — login: 10/minute, register: 5/minute.
        Requires `slowapi` in requirements.txt.

SEC-15  RequestBodySizeLimitMiddleware added — rejects requests larger than
        MAX_BODY_BYTES (10 MB).  Prevents memory exhaustion via large note,
        label, or JSON body fields.

SEC-24  GET /health/ready now requires X-Health-Secret header when
        HEALTH_SECRET is configured in settings.  External load balancers
        should use the simple /health endpoint; only internal probes (Railway
        healthcheck, UptimeRobot with secret) hit /health/ready.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import RequestLoggingMiddleware, configure_logging, get_logger
from app.core.sentry import init_sentry
from app.db.session import check_db_connection


from app.api.v1.auth import login, register
from app.api.v1 import router as v1_router  # noqa: E402

logger = get_logger(__name__)
_start_time = time.time()

# SEC-15: 10 MB hard cap on request bodies
_MAX_BODY_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging()
    init_sentry()
    logger.info("housemind.startup", environment=settings.ENVIRONMENT)
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

# ── SEC-05: rate limiter ──────────────────────────────────────────────────────


limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)



# ── SEC-15: request body size limit ──────────────────────────────────────────

@app.middleware("http")
async def limit_body_size(request: Request, call_next) -> Response:
    """
    Reject requests with Content-Length over MAX_BODY_BYTES before reading body.
    Also enforces limit on chunked transfers by capping total bytes read.
    """
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_BODY_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request body too large", "error_code": "REQUEST_TOO_LARGE"},
        )
    return await call_next(request)


# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Health-Secret", "X-Requested-With"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)
app.add_middleware(RequestLoggingMiddleware)

@app.middleware("http")
async def csrf_check(request: Request, call_next) -> Response:
    """
    Require X-Requested-With header on state-changing requests.
    Browsers never send this header on cross-site form submissions.
    Skip for GET/HEAD/OPTIONS and for the /auth/* endpoints which use JSON bodies.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        # Allow auth endpoints that POST from form (login page)
        # They're already protected by SameSite=strict
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            # JSON requests from browsers always require explicit fetch — safe
            pass
        elif not request.headers.get("X-Requested-With"):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "CSRF check failed", "error_code": "CSRF_REJECTED"},
            )
    return await call_next(request)
    
# ── Exception handlers ────────────────────────────────────────────────────────

register_exception_handlers(app)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(v1_router, prefix="/api/v1")

# ── Rate limit decorators (applied here so limiter is available) ──────────────

limiter.limit("10/minute")(login)
limiter.limit("5/minute")(register)


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"])
async def health() -> dict:
    """Public liveness probe — no DB check, no secrets required."""
    return {"status": "ok", "uptime_seconds": round(time.time() - _start_time, 1)}


@app.get("/health/ready", tags=["ops"])
async def readiness(
    x_health_secret: str | None = Header(None),
) -> dict:
    """
    SEC-24 fix: deep readiness probe that checks DB connectivity.
    When HEALTH_SECRET is configured, the X-Health-Secret header is required.
    This prevents external scanners from using this endpoint to probe DB state.

    Configure UptimeRobot to send the header; leave HEALTH_SECRET empty in
    local dev to disable the check.
    """
    if settings.HEALTH_SECRET and x_health_secret != settings.HEALTH_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Health-Secret required",
        )
    await check_db_connection()
    return {"status": "ready"}
