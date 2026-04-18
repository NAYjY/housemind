"""add parent_project_id to projects

Revision ID: 003_add_parent_project_id
Revises: 002_add_products
Create Date: 2025-01-15 00:00:00.000000

Changes:
  - projects.parent_project_id  UUID nullable FK → projects.id CASCADE
  - INDEX ix_projects_parent_project_id  (for subproject tree queries)

Run: alembic upgrade head
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision = "003_add_parent_project_id"
# down_revision = "002_add_products"
revision: str = "003_add_parent_project_id"
down_revision: Union[str, None] = "003_composite_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "parent_project_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
            default=None,
        ),
    )
    op.create_index(
        "ix_projects_parent_project_id",
        "projects",
        ["parent_project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_projects_parent_project_id", table_name="projects")
    op.drop_column("projects", "parent_project_id")