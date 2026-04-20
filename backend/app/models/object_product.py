from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class ObjectProduct(Base):
    __tablename__ = "object_products"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "object_id", "product_id",
            name="uq_object_products_project_object_product"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # object_id matches annotation.object_id (101-108)
    object_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship("Product")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<ObjectProduct project={self.project_id} object={self.object_id} product={self.product_id}>"