"""
app/models/annotation.py — HouseMind
Annotations pinned on project images.

Key design decisions:
  - position_x / position_y are normalised floats [0.0, 1.0]
    relative to image dimensions — pixel-free, resolution-independent.
    CHECK constraints enforce the valid range at the DB level.
  - Soft-delete via deleted_at TIMESTAMPTZ (no hard deletes).
  - linked_product_id is nullable — annotations may exist before a
    supplier product is assigned.
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
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Annotation(Base):
    __tablename__ = "annotations"
    __table_args__ = (
        # Enforce normalised coordinate range [0.0, 1.0]
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
    linked_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,   # fast lookup of all annotations tied to a product
    )

    # ------------------------------------------------------------------
    # Normalised coordinates — backend + frontend agreed on float [0,1]
    # DO NOT switch to pixels or integers.
    # ------------------------------------------------------------------
    position_x: Mapped[float] = mapped_column(Float, nullable=False)
    position_y: Mapped[float] = mapped_column(Float, nullable=False)

    label: Mapped[str | None]   = mapped_column(String(512), nullable=True)
    note: Mapped[str | None]    = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # ------------------------------------------------------------------
    # SOFT-DELETE — call .soft_delete() rather than session.delete()
    # All queries MUST filter WHERE deleted_at IS NULL (see db/queries.py)
    # BLK-7 fix: column type confirmed as DateTime (was String in backend agent draft)
    # ------------------------------------------------------------------
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # ------------------------------------------------------------------
    # RESOLVE STATE — added by migration 002 (BLK-12 fix)
    # Architect or Contractor can resolve/reopen annotation threads.
    # ------------------------------------------------------------------
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )

    # Relationships
    project_image: Mapped["ProjectImage"] = relationship(  # type: ignore[name-defined]
        "ProjectImage", back_populates="annotations"
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def is_resolved(self) -> bool:
        return self.resolved_at is not None

    def soft_delete(self) -> None:
        """Soft-delete this annotation. Persists on next session.flush()."""
        from datetime import timezone
        self.deleted_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return (
            f"<Annotation id={self.id} "
            f"pos=({self.position_x:.3f}, {self.position_y:.3f}) "
            f"deleted={self.deleted_at is not None} "
            f"resolved={self.resolved_at is not None}>"
        )
