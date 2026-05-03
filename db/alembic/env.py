"""
alembic/env.py — HouseMind

SEC-17 fix: transactional_ddl changed from False to True.
  With transactional_ddl=False, a migration that fails midway leaves the schema
  in a partially-applied state that no migration version describes.  Rolling back
  requires manual intervention.  With True, the entire migration runs inside a
  transaction and automatically rolls back on failure.

  PostgreSQL supports transactional DDL; this setting is safe for all existing
  migrations in this project.
"""
from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.models.base import Base       # noqa: E402
import app.models.user                 # noqa: F401, E402
import app.models.project              # noqa: F401, E402
import app.models.project_image        # noqa: F401, E402
import app.models.project_member       # noqa: F401, E402  ← new model
import app.models.annotation           # noqa: F401, E402
import app.models.invite_request       # noqa: F401, E402
import app.models.product              # noqa: F401, E402
import app.models.object_product       # noqa: F401, E402
import app.models.revoked_token        # noqa: F401, E402  ← new model
import app.models.annotation_resolution   # noqa: F401, E402  ← new model

target_metadata = Base.metadata


def get_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        transaction_per_migration=True,
        transactional_ddl=True,   # SEC-17: was False — partial migrations now auto-rollback
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()

    connectable = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        transactional_ddl=True,  # SEC-17
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    try:
        asyncio.run(run_migrations_online())
    except KeyboardInterrupt:
        pass
