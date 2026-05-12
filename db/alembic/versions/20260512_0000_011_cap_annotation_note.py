"""Cap annotation note length at 8192 chars.

Revision ID: 011_cap_annotation_note
Revises: 010_annotation_resolutions
Create Date: 2026-05-12
"""
from __future__ import annotations
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "011_cap_annotation_note"
down_revision: Union[str, None] = "010_annotation_resolutions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column(
        "annotations", "note",
        type_=sa.String(8192),
        existing_nullable=True,
    )

def downgrade() -> None:
    op.alter_column(
        "annotations", "note",
        type_=sa.Text(),
        existing_nullable=True,
    )