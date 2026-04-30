"""Drop magic_link_token partial index from invite_requests.

Revision ID: 009_drop_magic_link_index
Revises: 008_security_hardening
Create Date: 2026-04-29

Migration 004 dropped the magic_link_token column from invite_requests.
Migration 001 created a partial index on that column:
  ix_invite_requests_magic_link_token_pending

That index was not cleaned up in migration 004 because it was added via
op.execute() in migration 001 (not via op.create_index), so Alembic's
autogenerate does not track it automatically.

This migration drops the orphaned index explicitly. Running alembic check
after this migration should show no pending changes for invite_requests.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "009_drop_magic_link_index"
down_revision: Union[str, None] = "008_security_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the partial index that referenced the now-deleted magic_link_token column.
    # Use IF EXISTS to make this idempotent — if 004 happened to clean it up
    # in a future manual fix, this migration will not fail.
    op.execute(
        "DROP INDEX IF EXISTS ix_invite_requests_magic_link_token_pending"
    )


def downgrade() -> None:
    # Recreating this index is not meaningful — the column it indexed
    # (magic_link_token) no longer exists. Downgrade is a no-op.
    pass