"""Add password_hash to users, simplify invite_requests.

Revision ID: 004_add_password_hash
Revises: 003_add_parent_project_id
Create Date: 2026-04-19
"""
from __future__ import annotations
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "005_add_password_hash"
down_revision: Union[str, None] = "004_add_parent_project_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add password_hash — nullable so existing rows don't break
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(255), nullable=True),
    )
    # Drop magic_link_token — no longer used
    op.drop_column("invite_requests", "magic_link_token")


def downgrade() -> None:
    op.add_column(
        "invite_requests",
        sa.Column("magic_link_token", sa.String(512), nullable=True),
    )
    op.drop_column("users", "password_hash")