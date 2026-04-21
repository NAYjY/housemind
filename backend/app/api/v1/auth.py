"""
app/api/v1/auth.py — HouseMind
Email/password auth: register, login, architect-creates-user.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_architect
from app.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    InviteCreateRequest,
    InviteCreateResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(tags=["auth"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _issue_token(user: User) -> str:
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


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=_issue_token(user),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=user.role,
        user_id=str(user.id),
    )


# ── POST /auth/register ───────────────────────────────────────────────────────

@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Self-registration — primarily for architects."""
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password_hash=_hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    return _token_response(user)


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not _verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    return _token_response(user)


# ── POST /invites — architect creates collaborator account ────────────────────

@router.post("/invites", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreateRequest,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_architect),
) -> InviteCreateResponse:
    """
    Architect creates an account for a collaborator directly.
    No magic link — architect sets a temporary password and shares it manually.
    """
    result = await db.execute(select(User).where(User.email == body.invitee_email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        id=uuid.uuid4(),
        email=body.invitee_email,
        full_name=body.invitee_name,
        role=body.invitee_role,
        password_hash=_hash_password(body.temp_password),
    )
    db.add(user)
    await db.flush()

    return InviteCreateResponse(
        invite_id=user.id,
        invitee_email=user.email,
        invitee_role=user.role,
        status="created",
    )