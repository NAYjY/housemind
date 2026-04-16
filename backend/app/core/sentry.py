"""
Sentry integration for HouseMind FastAPI backend.

- Captures unhandled exceptions only (error level and above)
- Info/debug logs are suppressed to avoid quota burn
- PII scrubbing: JWT tokens, file URLs, email addresses stripped
- Environment-aware: silent in test/local, active in staging/production
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

logger = logging.getLogger(__name__)

# ── Patterns for PII scrubbing ─────────────────────────────────────────────
_JWT_RE    = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_EMAIL_RE  = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_S3_URL_RE = re.compile(r"https://[^\s\"]+\.s3\.[^\s\"]+")

_REDACT = "[REDACTED]"

_SCRUB_KEYS = frozenset({
    "password", "passwd", "secret", "token", "access_token",
    "refresh_token", "authorization", "api_key", "apikey",
    "invite_token", "jwt", "dsn",
})


def _scrub_value(value: Any) -> Any:
    """Strip PII from string values."""
    if not isinstance(value, str):
        return value
    value = _JWT_RE.sub(_REDACT, value)
    value = _EMAIL_RE.sub(_REDACT, value)
    value = _S3_URL_RE.sub(_REDACT, value)
    return value


def _scrub_dict(d: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in d.items():
        if k.lower() in _SCRUB_KEYS:
            out[k] = _REDACT
        elif isinstance(v, dict):
            out[k] = _scrub_dict(v)
        elif isinstance(v, list):
            out[k] = [_scrub_value(i) if isinstance(i, str) else i for i in v]
        else:
            out[k] = _scrub_value(v)
    return out


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """
    Filter and scrub events before they reach Sentry.

    - Drop events below ERROR level (info, debug, warning)
    - Scrub PII from request headers/data/extra
    """
    # Drop non-error log records forwarded by LoggingIntegration
    log_record = hint.get("log_record")
    if log_record and log_record.levelno < logging.ERROR:
        return None

    # Scrub request context
    request = event.get("request", {})
    if "headers" in request:
        request["headers"] = _scrub_dict(request["headers"])
    if "data" in request:
        data = request["data"]
        if isinstance(data, dict):
            request["data"] = _scrub_dict(data)

    # Scrub extra context
    extra = event.get("extra", {})
    if extra:
        event["extra"] = _scrub_dict(extra)

    # Scrub user context (keep id only)
    user = event.get("user", {})
    if user:
        event["user"] = {"id": user.get("id", _REDACT)}

    return event


def init_sentry() -> None:
    """
    Initialise Sentry SDK.

    Call once at application startup, before the FastAPI app is created.
    Does nothing when ENVIRONMENT is 'test' or 'local', or when SENTRY_DSN is absent.
    """
    dsn       = os.getenv("SENTRY_DSN", "")
    env       = os.getenv("ENVIRONMENT", "local")
    release   = os.getenv("GIT_SHA", "unknown")

    if not dsn or env in ("test", "local"):
        logger.info("Sentry disabled (env=%s, dsn_present=%s)", env, bool(dsn))
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        release=f"housemind-backend@{release}",

        # Only capture errors and above — no info/debug quota burn
        integrations=[
            LoggingIntegration(
                level=logging.ERROR,        # breadcrumbs from ERROR+
                event_level=logging.ERROR,  # send event at ERROR+
            ),
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],

        # Performance: disabled pre-MVP to conserve quota
        traces_sample_rate=0.0,

        # PII guard
        send_default_pii=False,
        before_send=_before_send,

        # Reduce noise from expected HTTP errors
        ignore_errors=[
            "ConnectionResetError",
            "asyncio.exceptions.CancelledError",
        ],
    )

    logger.info("Sentry initialised (env=%s, release=%s)", env, release)
