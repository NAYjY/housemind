"""
app/api/v1/auth.py — HouseMind
Email/password auth + architect invite flow.

Endpoints:
  POST /auth/register   — self-registration (all roles)
  POST /auth/login      — email + password
  POST /auth/logout     — revoke jti
  POST /invites         — architect adds an existing user to a project

Flow for non-architects:
  1. Contractor/homeowner/supplier registers at /register (self-service)
  2. They share their email with the architect
  3. Architect searches by email in InviteModal → POST /invites
  4. User is added to project_members immediately
  5. Next login they see the project in their profile
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect
from app.config import settings
from app.db.session import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.revoked_token import RevokedToken
from app.models.user import User
from app.schemas.auth import (
    InviteCreateRequest,
    InviteCreateResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(tags=["auth"])

_JWT_ALGORITHM = "HS256"  # SEC-09: never configurable via env

# SEC-06: pre-computed dummy hash for timing-safe login
_DUMMY_HASH = bcrypt.hashpw(b"__dummy__", bcrypt.gensalt(settings.BCRYPT_ROUNDS)).decode()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode(),
        bcrypt.gensalt(settings.BCRYPT_ROUNDS),
    ).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _issue_token(user: User) -> tuple[str, str, datetime]:
    """Returns (jwt_string, jti, expires_at). SEC-10: jti for revocation."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jti = str(uuid.uuid4())
    payload = {
        "sub":     str(user.id),
        "user_id": str(user.id),
        "email":   user.email,
        "role":    user.role,
        "jti":     jti,
        "exp":     expire,
        "iat":     now,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=_JWT_ALGORITHM)
    return token, jti, expire


def _set_auth_cookie(response: Response, token: str) -> None:
    """SEC-13: httpOnly cookie, secure outside local/test."""
    is_secure = settings.ENVIRONMENT not in ("local", "test")
    response.set_cookie(
        key="hm_token",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _build_token_response(user: User) -> tuple[TokenResponse, str]:
    token, _jti, _exp = _issue_token(user)
    return (
        TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            role=user.role,
            user_id=str(user.id),
        ),
        token,
    )


# ── POST /auth/register ───────────────────────────────────────────────────────

@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Self-registration for all roles.
    Non-architects (contractor/homeowner/supplier) register here,
    then share their email so an architect can add them to a project.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered · อีเมลนี้มีบัญชีอยู่แล้ว",
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

    resp_body, token = _build_token_response(user)
    _set_auth_cookie(response, token)
    return resp_body


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    SEC-06: always run bcrypt even when user doesn't exist.
    Prevents account enumeration via response timing.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    candidate_hash = user.password_hash if (user and user.password_hash) else _DUMMY_HASH
    password_ok = _verify_password(body.password, candidate_hash)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password · อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    # Option 3 lazy cleanup: prune caller's expired rows on successful login
    await db.execute(
        delete(RevokedToken).where(
            RevokedToken.user_id == user.id,
            RevokedToken.expires_at < datetime.now(timezone.utc),
        )
    )
    
    resp_body, token = _build_token_response(user)
    _set_auth_cookie(response, token)
    return resp_body


# ── POST /auth/logout ─────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def logout(
    response: Response,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """SEC-10: insert jti into revoked_tokens so token is rejected before expiry."""
    jti = user.get("jti")
    if jti:
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        db.add(RevokedToken(
            jti=jti,
            user_id=uuid.UUID(user["user_id"]),
            expires_at=expires_at,
        ))
        await db.flush()

    response.delete_cookie(key="hm_token", path="/")
    return Response(status_code=204)


# ── POST /invites ─────────────────────────────────────────────────────────────

@router.post("/invites", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreateRequest,
    db: AsyncSession = Depends(get_db),
    caller: dict = Depends(require_architect),
) -> InviteCreateResponse:
    """
    Add an existing registered user to a project.

    The architect uses InviteModal to search users by email/name,
    selects one, assigns a role, and submits.
    This endpoint adds them to project_members immediately —
    no email sent, no token, no expiry.
    """
    # Architect must own the project
    proj_result = await db.execute(
        select(Project).where(
            Project.id == body.project_id,
            Project.architect_id == uuid.UUID(caller["user_id"]),
            Project.status != "archived",
        )
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or you don't own it",
        )

    # Target user must exist and be active
    user_result = await db.execute(
        select(User).where(
            User.id == body.user_id,
            User.is_active == True,
        )
    )
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Idempotency — already a member?
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == body.project_id,
            ProjectMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=body.project_id,
        user_id=body.user_id,
        role=body.role,
    )
    db.add(member)
    # Also add to all subprojects so the user can access workspace views
    sub_result = await db.execute(
        select(Project).where(
            Project.parent_project_id == body.project_id,
            Project.status != "archived",
        )
    )
    for sub in sub_result.scalars().all():
        existing_sub = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == sub.id,
                ProjectMember.user_id == body.user_id,
            )
        )
        if not existing_sub.scalar_one_or_none():
            db.add(ProjectMember(
                id=uuid.uuid4(),
                project_id=sub.id,
                user_id=body.user_id,
                role=body.role,
            ))

    await db.flush()

    return InviteCreateResponse(
        project_id=body.project_id,
        user_id=body.user_id,
        role=body.role,
        status="added",
    )