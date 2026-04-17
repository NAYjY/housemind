"""
alembic/env.py — HouseMind
Reads DATABASE_URL injected by Railway at deploy time.
Supports both online (live DB) and offline (SQL dump) migration modes.
"""
from __future__ import annotations

import os
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
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
        raise RuntimeError("DATABASE_URL is not set.")
    
    # Normalise legacy postgres://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    
    # Check if we are in an async context (like your Docker setup)
    # If the URL already has +asyncpg, leave it alone.
    # If it's a plain postgresql://, we let SQLAlchemy handle it or force sync if needed.
    return url

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        transaction_per_migration=True,
        transactional_ddl=False,
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    """Run migrations in 'online' mode with an Async Engine."""
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()

    connectable = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        # This is the bridge: it runs the sync 'do_run_migrations' 
        # inside the async connection context.
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_offline() -> None:
    """Offline mode remains sync-friendly."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    # This is the critical change for SQLAlchemy 2.0 + Async
    try:
        asyncio.run(run_migrations_online())
    except KeyboardInterrupt:
        pass