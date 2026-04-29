"""Add object_id to object_products.

Revision ID: 006_object_products_object_id
Revises: 005_object_products
"""
from __future__ import annotations
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "007_object_products_object_id"
down_revision: Union[str, None] = "006_object_products"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old unique constraint first
    op.drop_constraint("uq_object_products_project_product", "object_products", type_="unique")
    
    # Add object_id column
    op.add_column(
        "object_products",
        sa.Column("object_id", sa.Integer(), nullable=True),
    )
    # Backfill with 0
    op.execute("UPDATE object_products SET object_id = 0 WHERE object_id IS NULL")
    op.alter_column("object_products", "object_id", nullable=False)
    
    # New unique constraint: one product per object per project
    op.create_unique_constraint(
        "uq_object_products_project_object_product",
        "object_products",
        ["project_id", "object_id", "product_id"],
    )
    op.create_index("ix_object_products_object_id", "object_products", ["object_id"])


def downgrade() -> None:
    op.drop_index("ix_object_products_object_id", table_name="object_products")
    op.drop_constraint("uq_object_products_project_object_product", "object_products", type_="unique")
    op.drop_column("object_products", "object_id")
    op.create_unique_constraint(
        "uq_object_products_project_product",
        "object_products",
        ["project_id", "product_id"],
    )