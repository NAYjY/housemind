"""
app/core/logging.py — HouseMind
Structured JSON logging via structlog.

Every request gets a trace_id injected into context so all log lines
from a single request are correlatable. Sentry is also notified of errors
through the existing sentry.py integration.

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("annotation.created", annotation_id=str(ann.id), user_id=user["user_id"])
"""
from __future__ import annotations

import logging
import sys
import time
import uuid
from collections.abc import Callable, Awaitable
from typing import Any

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


def configure_logging() -> None:
    """Call once at app startup, before any log messages are emitted."""
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.ENVIRONMENT == "local":
        # Human-readable colourised output in local dev
        renderer: Any = structlog.dev.ConsoleRenderer(colors=True)
    else:
        # Machine-readable JSON in staging/production (Railway log drain)
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if settings.ENVIRONMENT == "local" else logging.WARNING
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Injects a per-request trace_id into structlog context.
    Logs method, path, status, and duration for every request.
    Health check pings are suppressed to avoid log noise.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Health probes are noisy — skip logging them
        if request.url.path in ("/health", "/health/ready"):
            return await call_next(request)

        trace_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
        )

        t0 = time.perf_counter()
        log = get_logger("http")

        try:
            response = await call_next(request)
        except Exception as exc:
            log.error("request.error", exc_info=exc)
            raise

        duration_ms = round((time.perf_counter() - t0) * 1000, 1)
        log.info(
            "request.complete",
            status=response.status_code,
            duration_ms=duration_ms,
        )

        # Propagate trace_id to client for correlation
        response.headers["X-Request-ID"] = trace_id
        return response
