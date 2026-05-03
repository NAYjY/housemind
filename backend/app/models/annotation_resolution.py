"""
app/models/annotation_resolution.py — HouseMind

Tracks per-user resolution state for annotations.
One row per (annotation, user) — updated in place on resolve/unresolve.

State logic:
  Currently resolved   = unresolved_at IS NULL OR resolved_at > unresolved_at
  Currently unresolved = unresolved_at IS NOT NULL AND unresolved_at >= resolved_at
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

_MEMBER_ROLE = Enum(
    "architect", "contractor", "homeowner", "supplier",
    name="user_role",
    create_type=False,
)


class AnnotationResolution(Base):
    __tablename__ = "annotation_resolutions"
    __table_args__ = (
        UniqueConstraint(
            "annotation_id", "user_id",
            name="uq_annotation_resolutions_annotation_user",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    annotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(_MEMBER_ROLE, nullable=False)
    resolved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    unresolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    @property
    def is_resolved(self) -> bool:
        if self.unresolved_at is None:
            return True
        return self.resolved_at > self.unresolved_at

    def __repr__(self) -> str:
        return (
            f"<AnnotationResolution annotation={self.annotation_id} "
            f"user={self.user_id} resolved={self.is_resolved}>"
        )