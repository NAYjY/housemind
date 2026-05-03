"""Add annotation_resolutions table, drop resolved_at/resolved_by from annotations.

Revision ID: 010_annotation_resolutions
Revises: 009_drop_magic_link_index
Create Date: 2026-05-02
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010_annotation_resolutions"
down_revision: Union[str, None] = "009_drop_magic_link_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. CREATE annotation_resolutions ─────────────────────────────────────
    op.create_table(
        "annotation_resolutions",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "annotation_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("annotations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "role",
            postgresql.ENUM(name="user_role", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "unresolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "annotation_id", "user_id",
            name="uq_annotation_resolutions_annotation_user",
        ),
    )
    op.create_index(
        "ix_annotation_resolutions_annotation_id",
        "annotation_resolutions",
        ["annotation_id"],
    )
    op.create_index(
        "ix_annotation_resolutions_user_id",
        "annotation_resolutions",
        ["user_id"],
    )

    # ── 2. DROP old columns from annotations ──────────────────────────────────
    # Drop FK constraint on resolved_by first
    op.drop_constraint(
        "annotations_resolved_by_fkey",
        "annotations",
        type_="foreignkey",
    )
    op.drop_index("ix_annotations_resolved_at", table_name="annotations")
    op.drop_column("annotations", "resolved_at")
    op.drop_column("annotations", "resolved_by")

    # ── 3. DROP composite index that referenced resolved_at ───────────────────
    op.execute(
        "DROP INDEX IF EXISTS ix_annotations_image_id_resolved"
    )


def downgrade() -> None:
    # Restore columns
    op.add_column(
        "annotations",
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "annotations",
        sa.Column(
            "resolved_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.execute(
        """
        CREATE INDEX ix_annotations_resolved_at
        ON annotations (resolved_at)
        WHERE resolved_at IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX ix_annotations_image_id_resolved
        ON annotations (image_id, resolved_at)
        WHERE resolved_at IS NOT NULL AND deleted_at IS NULL
        """
    )

    # Drop new table
    op.drop_index("ix_annotation_resolutions_user_id", table_name="annotation_resolutions")
    op.drop_index("ix_annotation_resolutions_annotation_id", table_name="annotation_resolutions")
    op.drop_table("annotation_resolutions")