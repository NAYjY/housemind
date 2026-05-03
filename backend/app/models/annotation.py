"""
app/models/annotation.py — HouseMind
Annotations pinned on project images.

object_id (int 101-108) links annotation to a product category group.
Resolution is now tracked in annotation_resolutions table (migration 010).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Annotation(Base):
    __tablename__ = "annotations"
    __table_args__ = (
        CheckConstraint(
            "position_x BETWEEN 0.0 AND 1.0",
            name="ck_annotations_position_x_range",
        ),
        CheckConstraint(
            "position_y BETWEEN 0.0 AND 1.0",
            name="ck_annotations_position_y_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_images.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    object_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)

    position_x: Mapped[float] = mapped_column(Float, nullable=False)
    position_y: Mapped[float] = mapped_column(Float, nullable=False)

    label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # Relationships
    project_image: Mapped["ProjectImage"] = relationship(  # type: ignore[name-defined]
        "ProjectImage", back_populates="annotations"
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        from datetime import timezone
        self.deleted_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return (
            f"<Annotation id={self.id} "
            f"object_id={self.object_id} "
            f"pos=({self.position_x:.3f}, {self.position_y:.3f})>"
        )