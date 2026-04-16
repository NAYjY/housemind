"""
app/auth.py — HouseMind
JWT Bearer middleware, role guards, and project ownership checks.

Alignment fixes vs Backend agent draft:
  - Project.project_id → Project.id          (DB column is `id`)
  - SECRET_KEY used (not JWT_SECRET)          (DevOps canonical name)
  - Contractor added to annotation resolve guard (spec: Architect + Contractor)
  - Supplier treated as read-only (same as homeowner) until scoped

IMPORTANT: Magic-link routes (POST /auth/magic-link, POST /invite-requests)
MUST NOT use any of these dependencies — they are the auth entry points.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.config import settings
from app.db.session import get_db
from app.models.project import Project

bearer_scheme = HTTPBearer()

VALID_ROLES = {"architect", "contractor", "homeowner", "supplier"}


# ── Token decode ─────────────────────────────────────────────────────────────

def decode_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
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


def get_current_user(payload: dict = Depends(decode_token)) -> dict:
    """
    Extract user identity from the decoded JWT.
    Returns: {"user_id": <str>, "role": <str>}

    The claim used as user_id is controlled by JWT_USER_ID_FIELD env var
    (default "user_id"). On issuance the magic-link endpoint must embed
    the same field name.
    """
    role = payload.get("role")
    user_id = payload.get(settings.JWT_USER_ID_FIELD)

    if not role or role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token — missing or invalid role claim",
        )
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token — missing '{settings.JWT_USER_ID_FIELD}' claim",
        )

    return {"user_id": str(user_id), "role": role}


# ── Role guards ───────────────────────────────────────────────────────────────

def require_project_member(user: dict = Depends(get_current_user)) -> dict:
    """Any authenticated user with a valid role. Used on all read endpoints."""
    return user


def require_architect(user: dict = Depends(get_current_user)) -> dict:
    """
    Architect-only. Rejects contractor, homeowner, supplier.
    Used for project-level mutations (create, archive).
    """
    if user["role"] != "architect":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


def require_architect_or_contractor(user: dict = Depends(get_current_user)) -> dict:
    """
    Architect or Contractor.
    Used for annotation resolve/reopen — spec: both roles can manage thread status.
    """
    if user["role"] not in {"architect", "contractor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden — Architect or Contractor role required",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


# ── Project ownership check ───────────────────────────────────────────────────

async def require_project_owner(
    project_id: str,
    user: dict = Depends(require_architect),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Confirms the architect JWT user actually owns this specific project.
    Prevents architect A from mutating architect B's project.

    Uses Project.id (DB column name) — not Project.project_id.
    Composite index (architect_id, status) on projects table is used here;
    the single-column ix_projects_architect_id also helps this query.
    """
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.architect_id == user["user_id"],
            Project.status != "archived",  # cannot mutate archived projects
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this project, or the project does not exist",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user
