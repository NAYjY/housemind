"""Add products table and annotation resolve columns.

Revision ID: 002_products_and_resolve
Revises: 001_initial_schema
Create Date: 2025-01-02 00:00:00.000000

Changes:
  1. CREATE TABLE products
       - id UUID PK
       - supplier_id UUID FK(users.id) nullable
       - name, brand, model, price, currency, description
       - thumbnail_s3_key (raw S3 key — pre-sign at API layer)
       - specs JSONB
       - created_at, updated_at

  2. ALTER TABLE annotations
       ADD COLUMN resolved_at  TIMESTAMPTZ nullable
       ADD COLUMN resolved_by  UUID FK(users.id) nullable

  3. ADD FK constraint: annotations.linked_product_id → products.id
       (was nullable with no FK in migration 001 — now enforced)

  4. INDEXES
       - ix_products_supplier_id
       - ix_annotations_resolved_at (partial: WHERE resolved_at IS NOT NULL)
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "002_products_and_resolve"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. PRODUCTS TABLE
    # -----------------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id",               sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("supplier_id",      sa.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name",             sa.String(512),  nullable=False),
        sa.Column("brand",            sa.String(255),  nullable=True),
        sa.Column("model",            sa.String(255),  nullable=True),
        sa.Column("price",            sa.Float(),      nullable=True),
        sa.Column("currency",         sa.String(10),   nullable=False,
                  server_default="THB"),
        sa.Column("description",      sa.Text(),       nullable=True),
        # Raw S3 key; pre-signed at API response time.
        # Format: products/thumbnails/<product_id>.<ext>
        sa.Column("thumbnail_s3_key", sa.String(1024), nullable=False),
        sa.Column("specs",            postgresql.JSONB(), nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",       sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_products_supplier_id", "products", ["supplier_id"])

    # -----------------------------------------------------------------------
    # 2. ANNOTATIONS — add resolve columns
    # -----------------------------------------------------------------------
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

    # Partial index — only resolved annotations indexed; keeps index tiny
    op.execute(
        """
        CREATE INDEX ix_annotations_resolved_at
        ON annotations (resolved_at)
        WHERE resolved_at IS NOT NULL
        """
    )

    # -----------------------------------------------------------------------
    # 3. ADD FK: annotations.linked_product_id → products.id
    # Was a bare UUID column with no FK in migration 001.
    # -----------------------------------------------------------------------
    op.create_foreign_key(
        "fk_annotations_linked_product_id",
        "annotations",
        "products",
        ["linked_product_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_annotations_linked_product_id", "annotations", type_="foreignkey"
    )
    op.execute("DROP INDEX IF EXISTS ix_annotations_resolved_at")
    op.drop_column("annotations", "resolved_by")
    op.drop_column("annotations", "resolved_at")
    op.drop_index("ix_products_supplier_id", table_name="products")
    op.drop_table("products")
