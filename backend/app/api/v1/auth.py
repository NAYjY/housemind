"""
app/api/v1/auth.py — HouseMind
Email/password auth: register, login, logout, architect-creates-user.

Security fixes:

SEC-05  Rate limiting via slowapi — login: 10/minute, register: 5/minute.
        Add `slowapi` to requirements.txt and wire limiter in main.py.

SEC-06  Timing oracle fixed — always run bcrypt regardless of whether the
        user exists.  Previously short-circuiting on unknown email allowed
        account enumeration via response latency.

SEC-10  JWT now contains a `jti` (uuid4) claim.  Logout endpoint inserts
        the jti into revoked_tokens so it is rejected by get_current_user.

SEC-13  Login/register/redeem set an httpOnly cookie containing the JWT.
        The token is also returned in the response body for API clients and
        local dev where the Vercel proxy is absent.

SEC-20  Password strength validator enforces: 8+ chars, 1 upper, 1 lower,
        1 digit.  Plain "password" or "12345678" are rejected at schema level.

SEC-21  POST /auth/logout — revokes the current token's jti.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect
from app.config import settings
from app.db.session import get_db
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

# SEC-09: hardcoded — never read from env
_JWT_ALGORITHM = "HS256"

# ── Dummy hash for timing-safe login (SEC-06) ─────────────────────────────────
# Pre-computed at import time so it is available without blocking I/O.
_DUMMY_HASH = bcrypt.hashpw(b"__dummy__", bcrypt.gensalt(settings.BCRYPT_ROUNDS)).decode()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode(),
        bcrypt.gensalt(settings.BCRYPT_ROUNDS),
    ).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _issue_token(user: User) -> tuple[str, str, datetime]:
    """
    Issue a signed JWT.  Returns (token, jti, expires_at).

    SEC-10: jti claim added — required for revocation support.
    SEC-09: algorithm hardcoded to HS256.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "jti": jti,
        "exp": expire,
        "iat": now,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=_JWT_ALGORITHM)
    return token, jti, expire


def _set_auth_cookie(response: Response, token: str) -> None:
    """
    SEC-13: set httpOnly cookie so the JWT is inaccessible to JavaScript.
    secure=True in non-local environments (requires HTTPS).
    samesite="lax" works through the Vercel reverse proxy in production.
    """
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


def _token_response(user: User) -> tuple[TokenResponse, str]:
    """Returns (schema_response, raw_token)."""
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

# NOTE: Decorate with @limiter.limit("5/minute") in main.py after wiring slowapi.
@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Self-registration — primarily for architects.
    SEC-05: rate-limited (wire @limiter.limit in main.py).
    SEC-13: sets httpOnly cookie alongside response body.
    SEC-20: password strength enforced by RegisterRequest schema validator.
    """
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

    resp_body, token = _token_response(user)
    _set_auth_cookie(response, token)
    return resp_body


# ── POST /auth/login ──────────────────────────────────────────────────────────

# NOTE: Decorate with @limiter.limit("10/minute") in main.py after wiring slowapi.
@router.post("/auth/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    SEC-06 timing oracle fix: always run _verify_password even when the user
    does not exist.  Previously the code short-circuited on `not user`, making
    unknown emails ~300ms faster than known emails and enabling account
    enumeration via latency.

    SEC-13: sets httpOnly cookie.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # SEC-06: always call bcrypt regardless of whether user exists.
    # If user is None or has no password_hash, compare against a dummy hash so
    # the timing is identical to a real failed login.
    candidate_hash = (user.password_hash if user and user.password_hash else _DUMMY_HASH)
    password_ok = _verify_password(body.password, candidate_hash)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    resp_body, token = _token_response(user)
    _set_auth_cookie(response, token)
    return resp_body


# ── POST /auth/logout ─────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def logout(
    response: Response,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    jti = user.get("jti")
    if jti:
        from datetime import datetime, timedelta, timezone
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        revoked = RevokedToken(
            jti=jti,
            user_id=uuid.UUID(user["user_id"]),
            expires_at=expires_at,
        )
        db.add(revoked)
        await db.flush()

    response.delete_cookie(key="hm_token", path="/")
    return Response(status_code=204)


# ── POST /invites — architect creates collaborator account ────────────────────

@router.post("/invites", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreateRequest,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_architect),
) -> InviteCreateResponse:
    """
    Architect creates an account for a collaborator directly.
    SEC-04: new user is added to project_members so require_project_member
    works for them immediately.
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

    # SEC-04: add to project_members immediately so membership checks pass.
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=body.project_id,
        user_id=user.id,
        role=body.invitee_role,
    )
    db.add(member)
    await db.flush()

    return InviteCreateResponse(
        invite_id=user.id,
        invitee_email=user.email,
        invitee_role=user.role,
        status="created",
    )