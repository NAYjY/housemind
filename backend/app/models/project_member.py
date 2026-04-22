"""
app/models/project_member.py — HouseMind

SEC-04 fix: explicit project membership table.

Previously, require_project_member was a no-op that returned any
authenticated user regardless of which project was being accessed.  This
table is the authoritative source for "does this user belong to this project".

Populated by:
  - POST /projects          → architect added as member automatically
  - POST /projects/{id}/sub → architect added as member automatically
  - POST /invites           → new user added on account creation

index strategy:
  - ix_project_members_project_id  — list members of a project
  - ix_project_members_user_id     — list projects for a user
  - uq_project_members_project_user — enforce one row per (project, user)
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

_MEMBER_ROLE = Enum(
    "architect", "contractor", "homeowner", "supplier",
    name="user_role",
    create_type=False,  # enum already created by migration 001
)


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "user_id",
            name="uq_project_members_project_user",
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
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(_MEMBER_ROLE, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<ProjectMember project={self.project_id} "
            f"user={self.user_id} role={self.role}>"
        )
