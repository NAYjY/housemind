"""
app/schemas/auth.py — HouseMind
Pydantic schemas for magic-link invite flow and JWT responses.
"""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class InviteCreateRequest(BaseModel):
    """Body for POST /api/v1/invites — architect sends an invite"""
    project_id: UUID
    invitee_email: EmailStr
    invitee_role: str = Field(pattern=r"^(contractor|homeowner|supplier)$")


class InviteCreateResponse(BaseModel):
    """Response after invite is created — magic link is emailed, not returned here"""
    invite_id: UUID
    invitee_email: str
    invitee_role: str
    status: str  # "pending"


class MagicLinkRedeemRequest(BaseModel):
    """Body for POST /api/v1/auth/redeem — user clicks magic link"""
    token: str


class TokenResponse(BaseModel):
    """JWT returned after successful magic-link redemption"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int   # seconds
    role: str
    user_id: str
