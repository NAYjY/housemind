"""Add project_members and revoked_tokens tables.

Revision ID: 007_security_hardening
Revises: 006_object_products_object_id
Create Date: 2026-04-21

Changes:
  1. CREATE TABLE project_members
       (id, project_id, user_id, role, joined_at)
       UNIQUE(project_id, user_id)

  2. CREATE TABLE revoked_tokens
       (jti PK, user_id, revoked_at, expires_at)
       INDEX on expires_at for cleanup queries

  3. BACKFILL project_members from existing data:
       - All non-archived projects → architect added as member
       - Accepted invite_requests → invitee added as member

  4. SEC-17 note: this migration runs under transactional_ddl=True (fixed in
     env.py).  If any statement fails, the entire migration rolls back cleanly.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007_security_hardening"
down_revision: Union[str, None] = "006_object_products_object_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. project_members ───────────────────────────────────────────────────
    op.create_table(
        "project_members",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            postgresql.ENUM(name="user_role", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )
    op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    # ── 2. revoked_tokens ────────────────────────────────────────────────────
    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_revoked_tokens_user_id", "revoked_tokens", ["user_id"])
    op.create_index("ix_revoked_tokens_expires_at", "revoked_tokens", ["expires_at"])

    # ── 3. Backfill project_members ──────────────────────────────────────────

    # 3a. All non-archived projects → architect is a member
    op.execute(
        """
        INSERT INTO project_members (id, project_id, user_id, role, joined_at)
        SELECT
            gen_random_uuid(),
            p.id,
            p.architect_id,
            'architect',
            p.created_at
        FROM projects p
        WHERE p.status != 'archived'
        ON CONFLICT ON CONSTRAINT uq_project_members_project_user DO NOTHING
        """
    )

    # 3b. Accepted invite_requests → invitee is a member
    # invite_requests only has email; join to users to get user_id.
    op.execute(
        """
        INSERT INTO project_members (id, project_id, user_id, role, joined_at)
        SELECT
            gen_random_uuid(),
            ir.project_id,
            u.id,
            ir.invitee_role::user_role,
            COALESCE(ir.accepted_at, ir.created_at)
        FROM invite_requests ir
        JOIN users u ON u.email = ir.invitee_email
        WHERE ir.status = 'accepted'
        ON CONFLICT ON CONSTRAINT uq_project_members_project_user DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_revoked_tokens_expires_at", table_name="revoked_tokens")
    op.drop_index("ix_revoked_tokens_user_id", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")

    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_project_members_project_id", table_name="project_members")
    op.drop_table("project_members")
