"""
app/models/project_image.py — HouseMind
Project images stored in S3; metadata lives here.
Soft-delete via deleted_at TIMESTAMPTZ.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class ProjectImage(Base):
    __tablename__ = "project_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    s3_key: Mapped[str]      = mapped_column(String(1024), nullable=False)
    s3_bucket: Mapped[str]   = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[str]   = mapped_column(String(128), nullable=False)
    width_px: Mapped[int | None]  = mapped_column(Integer, nullable=True)
    height_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # -----------------------------------------------------------------------
    # SOFT-DELETE — never hard-delete; set deleted_at = NOW() instead
    # -----------------------------------------------------------------------
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # Relationships
    project: Mapped["Project"] = relationship(  # type: ignore[name-defined]
        "Project", back_populates="project_images"
    )
    annotations: Mapped[list["Annotation"]] = relationship(  # type: ignore[name-defined]
        "Annotation", back_populates="project_image"
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        """Call this instead of session.delete(image)."""
        from datetime import timezone
        self.deleted_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<ProjectImage id={self.id} project_id={self.project_id}>"
