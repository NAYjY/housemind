"""Add object_id to annotations, add object_products table, drop linked_product_id.

Revision ID: 005_object_products
Revises: 004_add_password_hash
Create Date: 2026-04-20
"""
from __future__ import annotations
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "006_object_products"
down_revision: Union[str, None] = "005_add_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop FK constraint on linked_product_id first
    op.drop_constraint(
        "fk_annotations_linked_product_id",
        "annotations",
        type_="foreignkey",
    )
    # 2. Drop index on linked_product_id
    op.drop_index("ix_annotations_linked_product_id", table_name="annotations")

    # 3. Add object_id nullable first (so existing rows don't break)
    op.add_column(
        "annotations",
        sa.Column("object_id", sa.Integer(), nullable=True),
    )
    # 4. Backfill existing rows with 0 (unknown category)
    op.execute("UPDATE annotations SET object_id = 0 WHERE object_id IS NULL")

    # 5. Now make it NOT NULL
    op.alter_column("annotations", "object_id", nullable=False)

    # 6. Drop linked_product_id column
    op.drop_column("annotations", "linked_product_id")

    # 7. Index on object_id for filtering
    op.create_index("ix_annotations_object_id", "annotations", ["object_id"])

    # 8. Create object_products table
    op.create_table(
        "object_products",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            # index=True,
        ),
        sa.Column(
            "product_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "product_id", name="uq_object_products_project_product"),
    )
    # op.create_index("ix_object_products_project_id", "object_products", ["project_id"])
    # op.create_index("ix_object_products_product_id", "object_products", ["product_id"])


def downgrade() -> None:
    op.drop_table("object_products")
    op.drop_index("ix_annotations_object_id", table_name="annotations")
    op.add_column(
        "annotations",
        sa.Column("linked_product_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_annotations_linked_product_id", "annotations", ["linked_product_id"]
    )
    op.create_foreign_key(
        "fk_annotations_linked_product_id",
        "annotations",
        "products",
        ["linked_product_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("annotations", "object_id")