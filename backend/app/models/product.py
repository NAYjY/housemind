"""
app/models/product.py — HouseMind
Supplier product catalogue.
thumbnail_url stores a raw S3 key; pre-signing happens in the service layer.

NOTE: The products table was absent from the initial migration delivered by the
Database agent. Migration 002 (see db/alembic/versions/20250102_0001_002_add_products.py)
adds this table. This model must not be imported until that migration has run.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Supplier who owns this product listing
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, server_default="THB")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Raw S3 key — pre-sign before returning to clients
    thumbnail_s3_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Flexible JSONB for specs (dimensions, material, colour, etc.)
    specs: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Product id={self.id} name={self.name!r}>"
