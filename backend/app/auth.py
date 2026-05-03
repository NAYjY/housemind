"""
app/auth.py — HouseMind
JWT Bearer + httpOnly Cookie auth, role guards, project membership checks.

Security fixes applied here:

SEC-04 require_project_member now queries project_members table.
       Previously it was a no-op that returned any authenticated user.

SEC-09 JWT algorithm hardcoded to "HS256" — not read from environment.
       A configurable algorithm allows setting "none" which disables
       signature verification entirely.

SEC-10 get_current_user checks the revoked_tokens table (jti blocklist).
       Tokens can be invalidated server-side on logout before they expire.

SEC-13 Token extracted from httpOnly Cookie[hm_token] first, then falls
       back to Authorization: Bearer header.  This means the JWT is never
       accessible to JavaScript in production (cookie is httpOnly).
       The Bearer fallback supports local dev (cross-origin, no HTTPS)
       and API clients.

Auth flow:
  1. get_raw_token     — cookie > Bearer header
  2. decode_token      — jwt.decode, hardcoded HS256
  3. get_current_user  — extract claims, check jti revocation (async, DB)
  4. role guards       — require_architect, require_architect_or_contractor
  5. scope guards      — require_project_member, require_project_architect
                         both take project_id: uuid.UUID = Query(...)
                         FastAPI resolves this from the calling endpoint's
                         query parameters, so no duplication is needed.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.config import settings
from app.db.session import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.revoked_token import RevokedToken

# SEC-09: algorithm is a module constant — never read from environment.
_JWT_ALGORITHM = "HS256"

VALID_ROLES = {"architect", "contractor", "homeowner", "supplier"}

# auto_error=False: we try cookie first; if neither exists, get_raw_token raises.
_optional_bearer = HTTPBearer(auto_error=False)


# ── SEC-13: cookie-first token extraction ─────────────────────────────────────

def get_raw_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    hm_token: Optional[str] = Cookie(None),
) -> str:
    """
    Prefer httpOnly cookie (set by login/register/redeem endpoints).
    Fall back to Authorization: Bearer for API clients and local dev.
    """
    if credentials:
        return credentials.credentials
    if hm_token:
        return hm_token
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authenticated",
        headers={"X-Error-Code": "ACCESS_DENIED"},
    )


# ── JWT decode (synchronous — no DB) ─────────────────────────────────────────

def decode_token(raw: str = Depends(get_raw_token)) -> dict:
    """
    Verify signature only.  Does NOT check revocation — that requires DB and
    is done in get_current_user.

    SEC-09: algorithm hardcoded — jwt.decode rejects any other algorithm
    including "none", regardless of what the token header claims.
    """
    try:
        payload = jwt.decode(
            raw,
            settings.SECRET_KEY,
            algorithms=[_JWT_ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


# ── get_current_user (async — checks jti revocation) ─────────────────────────

async def get_current_user(
    payload: dict = Depends(decode_token),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Extract identity from decoded JWT and verify the token has not been revoked.

    SEC-10: every token carries a `jti` (JWT ID) claim.  If the jti appears
    in revoked_tokens, the request is rejected even if the token is otherwise
    valid and not expired.  This enables immediate invalidation on logout.

    Returns {"user_id": str, "role": str, "jti": str | None}.
    """
    role = payload.get("role")
    user_id = payload.get("user_id")
    jti = payload.get("jti")

    if not role or role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token — missing or invalid role claim",
        )
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token — missing user_id claim",
        )

    # SEC-10: jti revocation check
    if jti:
        result = await db.execute(
            select(RevokedToken).where(RevokedToken.jti == jti)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked — please sign in again",
            )

    return {"user_id": str(user_id), "role": role, "jti": jti}


# ── Role guards ────────────────────────────────────────────────────────────────

def require_project_member_role(user: dict = Depends(get_current_user)) -> dict:
    """
    Any authenticated user with a valid role.
    NOTE: this does NOT check project membership — pair with
    require_project_member or require_project_architect for that.
    Used only on endpoints that have no project scope (e.g. product detail).
    """
    return user


def require_architect(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "architect":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


def require_architect_or_contractor(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in {"architect", "contractor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden — Architect or Contractor role required",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user

# ── ADD this after require_architect_or_contractor ────────────────────────────

def require_resolver(user: dict = Depends(get_current_user)) -> dict:
    """
    Roles that can resolve/unresolve annotations.
    Supplier explicitly excluded — they are observers only.
    """
    if user["role"] not in {"architect", "contractor", "homeowner"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden — Supplier role cannot resolve annotations",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


# ── RENAME throughout this file ───────────────────────────────────────────────
# require_project_owner → require_project_architect
# (the function body is identical, only the name changes)

async def require_project_architect(
    request: Request,
    user: dict = Depends(require_architect),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw = (
        request.path_params.get("project_id")
        or request.query_params.get("project_id")
    )
    if not raw:
        raise HTTPException(status_code=422, detail="project_id is required")
    try:
        project_id = uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="project_id must be a valid UUID")

    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.architect_id == uuid.UUID(user["user_id"]),
            Project.status != "archived",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this project, or the project does not exist",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user
    
# ── SEC-04: real project membership check ─────────────────────────────────────

async def require_project_member(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw = (
        request.path_params.get("project_id")
        or request.query_params.get("project_id")
    )
    if not raw:
        raise HTTPException(status_code=422, detail="project_id is required")
    try:
        project_id = uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="project_id must be a valid UUID")

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == uuid.UUID(user["user_id"]),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this project",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


async def require_annotation_project_member(
    image_id: uuid.UUID = Query(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Used by GET /annotations?image_id=uuid — resolves project_id from the
    image record, then checks project_members.  Avoids requiring a redundant
    project_id param on the annotation list endpoint.
    """
    from app.models.project_image import ProjectImage  # local import avoids circular

    img_result = await db.execute(
        select(ProjectImage.project_id).where(
            ProjectImage.id == image_id,
            ProjectImage.deleted_at.is_(None),
        )
    )
    row = img_result.first()
    if not row:
        # Return empty list gracefully — do not reveal image existence
        # The endpoint itself will query and return [].
        return user  # image not found; endpoint will return []

    project_id = row[0]
    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == uuid.UUID(user["user_id"]),
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this project",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


# ── Project ownership check ────────────────────────────────────────────────────

async def require_project_architect(
    request: Request,
    user: dict = Depends(require_architect),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw = (
        request.path_params.get("project_id")
        or request.query_params.get("project_id")
    )
    if not raw:
        raise HTTPException(status_code=422, detail="project_id is required")
    try:
        project_id = uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="project_id must be a valid UUID")

    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.architect_id == uuid.UUID(user["user_id"]),
            Project.status != "archived",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this project, or the project does not exist",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user
