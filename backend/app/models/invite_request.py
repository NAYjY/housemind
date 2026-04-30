"""
app/models/invite_request.py — HouseMind
Invite records — status tracking only (magic_link_token dropped in migration 004).
The active invite flow uses POST /invites → project_members directly.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

INVITE_STATUS = Enum(
    "pending", "accepted", "expired", "revoked",
    name="invite_status", create_type=False
)


class InviteRequest(Base):
    __tablename__ = "invite_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    invitee_email: Mapped[str] = mapped_column(String(320), nullable=False)
    invitee_role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        INVITE_STATUS, nullable=False, server_default="pending", index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<InviteRequest id={self.id} "
            f"email={self.invitee_email!r} status={self.status}>"
        )