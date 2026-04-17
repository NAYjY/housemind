"""
app/models/project.py — HouseMind
Building projects owned by an architect.
Soft-delete via status='archived' rather than a deleted_at column.
Hard DELETE is never used on projects.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

PROJECT_STATUS = Enum(
    "draft", "active", "completed", "archived",
    name="project_status",create_type=False
)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    architect_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        PROJECT_STATUS, nullable=False, server_default="draft", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    architect: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User", back_populates="projects", foreign_keys=[architect_id]
    )
    project_images: Mapped[list["ProjectImage"]] = relationship(  # type: ignore[name-defined]
        "ProjectImage", back_populates="project"
    )

    @property
    def is_archived(self) -> bool:
        return self.status == "archived"

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r} status={self.status}>"
