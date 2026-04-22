"""
app/models/revoked_token.py — HouseMind

SEC-10 fix: JWT blocklist.

Every JWT now contains a `jti` (JWT ID) claim (uuid4 string).  On logout,
the jti is inserted here.  get_current_user checks this table on every
authenticated request and rejects revoked tokens before they expire naturally.

Cleanup: rows where expires_at < NOW() are dead weight.  Add a pg_cron job
or a periodic Alembic migration to prune them:
  DELETE FROM revoked_tokens WHERE expires_at < NOW();
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    # jti is the JWT ID claim — a uuid4 string, 36 chars max
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # expires_at mirrors the JWT exp — row can be safely deleted after this
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<RevokedToken jti={self.jti} user={self.user_id}>"
