"""
app/api/v1/auth.py — HouseMind
Magic-link invite flow: generate token → email → redeem → JWT issued.

These routes are EXCLUDED from JWT middleware (they are the auth entry points).
Do not add require_project_member or any bearer dependency here.

Flow:
  Architect → POST /api/v1/invites          (create invite, email sent)
  Invitee   → POST /api/v1/auth/redeem      (validate token → JWT returned)
              (user record created on first redemption if not already exists)
"""
from __future__ import annotations

import os

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.auth import require_architect
from app.config import settings
from app.services.email import send_magic_link
from app.db.session import get_db
from app.models.invite_request import InviteRequest
from app.models.user import User
from app.schemas.auth import (
    InviteCreateRequest,
    InviteCreateResponse,
    MagicLinkRedeemRequest,
    TokenResponse,
)

router = APIRouter(tags=["auth"])

INVITE_TTL_HOURS = 72  # links expire after 3 days


# ── POST /invites — architect sends an invite ─────────────────────────────────

@router.post("/invites", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect),
) -> InviteCreateResponse:
    """
    Architect creates an invite for a collaborator.
    A magic-link token is stored in the DB and should be emailed to the invitee.

    NOTE: Email dispatch is not implemented here — wire up an email service
    (Resend, SendGrid, etc.) before GA. The token is returned in the response
    ONLY for local/test environments where ENVIRONMENT != "production".
    """
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)

    invite = InviteRequest(
        id=uuid.uuid4(),
        project_id=body.project_id,
        invited_by=uuid.UUID(user["user_id"]),
        invitee_email=body.invitee_email,
        invitee_role=body.invitee_role,
        magic_link_token=token,
        status="pending",
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()

    # Dispatch magic-link email (non-fatal if email service unavailable)
    base_url = os.getenv("FRONTEND_URL", "https://housemind.app")
    try:
        await send_magic_link(
            to_email=body.invitee_email,
            token=token,
            project_id=str(body.project_id),
            invitee_role=body.invitee_role,
            base_url=base_url,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("email.dispatch_failed: %s", exc)

    return InviteCreateResponse(
        invite_id=invite.id,
        invitee_email=invite.invitee_email,
        invitee_role=invite.invitee_role,
        status="pending",
    )


# ── POST /auth/redeem — invitee clicks magic link ────────────────────────────

@router.post("/auth/redeem", response_model=TokenResponse)
async def redeem_magic_link(
    body: MagicLinkRedeemRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Validate a magic-link token.
    - Finds the pending invite by token.
    - Creates the user record if not already present.
    - Marks the invite as accepted.
    - Issues a JWT with role and user_id claims.

    No bearer token is required on this route — it IS the auth entry point.
    """
    # Partial index ix_invite_requests_magic_link_token_pending makes this fast
    result = await db.execute(
        select(InviteRequest).where(
            InviteRequest.magic_link_token == body.token,
            InviteRequest.status == "pending",
        )
    )
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or already-used magic link",
        )

    now = datetime.now(timezone.utc)
    if invite.expires_at and invite.expires_at < now:
        invite.status = "expired"
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Magic link has expired. Ask the architect to resend an invite.",
        )

    # Upsert user — create on first redemption
    user_result = await db.execute(
        select(User).where(User.email == invite.invitee_email)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        user = User(
            id=uuid.uuid4(),
            email=invite.invitee_email,
            full_name=invite.invitee_email,  # placeholder — user can update profile later
            role=invite.invitee_role,
        )
        db.add(user)
        await db.flush()
    else:
        # If user exists but role has changed (re-invited with new role), update it
        if user.role != invite.invitee_role:
            user.role = invite.invitee_role

    # Mark invite accepted
    invite.status = "accepted"
    invite.accepted_at = now
    await db.flush()

    # Issue JWT
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "exp": expire,
        "iat": now,
    }
    access_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=user.role,
        user_id=str(user.id),
    )


def _issue_token(user: "User") -> str:
    """
    Internal helper used by tests to mint a JWT without going through the invite flow.
    Import: from app.api.v1.auth import _issue_token
    """
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
