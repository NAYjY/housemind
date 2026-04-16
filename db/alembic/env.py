"""
alembic/env.py — HouseMind
Reads DATABASE_URL injected by Railway at deploy time.
Supports both online (live DB) and offline (SQL dump) migration modes.
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ---------------------------------------------------------------------------
# Alembic Config object (gives access to alembic.ini values)
# ---------------------------------------------------------------------------
config = context.config

# Wire up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import ALL models so Alembic can detect schema changes via autogenerate
# ---------------------------------------------------------------------------
# Keep this import even if models are not used directly here — Alembic needs
# the metadata populated before it can diff the schema.
from app.models.base import Base  # noqa: E402
import app.models.user            # noqa: F401, E402
import app.models.project         # noqa: F401, E402
import app.models.project_image   # noqa: F401, E402
import app.models.annotation      # noqa: F401, E402
import app.models.invite_request  # noqa: F401, E402
import app.models.product         # noqa: F401, E402

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Railway DATABASE_URL override
# Railway sets DATABASE_URL as a plain postgres:// URI; SQLAlchemy 1.4+
# requires postgresql://, so we normalise it here.
# ---------------------------------------------------------------------------
def get_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Railway should inject this automatically on deploy."
        )
    # Normalise legacy postgres:// → postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Force the psycopg2 driver (Railway default driver)
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


# ---------------------------------------------------------------------------
# Offline mode — emit SQL to stdout without a live DB connection
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode — connect to Railway PostgreSQL and apply migrations
# ---------------------------------------------------------------------------
def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,   # Railway: one connection per deploy, not a pool
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            # Emit a transaction per migration step for safer rollback
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
