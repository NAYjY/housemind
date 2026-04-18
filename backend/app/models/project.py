"""
app/models/project.py — HouseMind
Building projects owned by an architect.

Changes vs original:
  - Added parent_project_id nullable FK (self-referential) for sub-project tree.
    figmaTem had ParentProjectID on the Projects table; this merges that pattern.
  - Added subprojects relationship.
  - Soft-delete via status='archived' (unchanged).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

PROJECT_STATUS = Enum(
    "draft", "active", "completed", "archived",
    name="project_status", create_type=False
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
    # -----------------------------------------------------------------------
    # PARENT PROJECT — nullable; NULL means top-level project.
    # Mirrors figmaTem's ParentProjectID column.
    # -----------------------------------------------------------------------
    parent_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        default=None,
        index=True,   # ← DB engineer: ensure ix_projects_parent_project_id exists
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
    # Self-referential: one project → many subprojects
    subprojects: Mapped[list["Project"]] = relationship(
        "Project",
        backref="parent",
        remote_side=[id],
        foreign_keys=[parent_project_id],
    )

    @property
    def is_archived(self) -> bool:
        return self.status == "archived"

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r} status={self.status}>"