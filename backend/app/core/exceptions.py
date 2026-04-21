"""
app/core/exceptions.py — HouseMind
Global FastAPI exception handlers.

All API errors return a consistent shape:
  { "detail": "<human message>", "error_code": "<SCREAMING_SNAKE>" }

error_code is machine-readable and used by the frontend to distinguish:
  ACCESS_DENIED         → show permission error, do not retry
  TOKEN_EXPIRED         → clear token, redirect /auth/expired
  VALIDATION_ERROR      → highlight form field
  NOT_FOUND             → show 404 UI
  S3_ERROR              → retry once, then surface error
  INTERNAL_ERROR        → generic error toast
"""
from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.logging import get_logger

logger = get_logger(__name__)


def _error(detail: str, code: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "error_code": code},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app instance."""

    @app.exception_handler(RequestValidationError)
    async def validation_handler(req: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning("validation.error", errors=exc.errors(), path=str(req.url))
        return _error(
            detail=f"Validation error: {exc.errors()[0]['msg']}",
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(ValidationError)
    async def pydantic_handler(req: Request, exc: ValidationError) -> JSONResponse:
        logger.warning("pydantic.validation.error", errors=exc.errors())
        return _error(
            detail="Invalid data",
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(404)
    async def not_found_handler(req: Request, _exc: Exception) -> JSONResponse:
        return _error(
            detail=f"Not found: {req.url.path}",
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    @app.exception_handler(405)
    async def method_not_allowed_handler(req: Request, exc: Exception) -> JSONResponse:
        return _error(
            detail=f"Method {req.method} not allowed on {req.url.path}",
            code="METHOD_NOT_ALLOWED",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(req: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "unhandled.exception",
            exc_type=type(exc).__name__,
            path=str(req.url),
            exc_info=exc,
        )
        return _error(
            detail="An unexpected error occurred",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
