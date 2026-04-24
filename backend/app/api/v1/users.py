"""
app/api/v1/users.py — HouseMind
User search for architect invite flow.

GET /users/search?q=<email_or_name>
  - Architect-only
  - Returns users matching query by email prefix or name
  - Excludes users already in the project
  - Limit 20 results max
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_architect
from app.db.session import get_db
from app.models.project_member import ProjectMember
from app.models.user import User
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/users", tags=["users"])


class UserSearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    q: str = Query(..., min_length=2, description="Email prefix or name fragment"),
    project_id: uuid.UUID = Query(..., description="Exclude users already in this project"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_architect),
) -> list[UserSearchResult]:
    """
    Search users by email or name.
    Excludes users already members of project_id.
    Returns max 20 results.
    """
    like = f"{q.strip()}%"
    contains = f"%{q.strip()}%"

    # Subquery: user_ids already in this project
    already_in = (
        select(ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    ).scalar_subquery()

    stmt = (
        select(User)
        .where(
            or_(
                User.email.ilike(like),
                User.full_name.ilike(contains),
            ),
            User.is_active == True,
            User.id.not_in(already_in),
        )
        .order_by(User.email)
        .limit(20)
    )

    result = await db.execute(stmt)
    return list(result.scalars().all())