"""
app/api/v1/dev_auth.py — HouseMind
DEV ONLY — never expose in production.
Creates a user and issues a JWT directly, no magic link needed.
Gate with ENVIRONMENT check.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.config import settings
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/dev", tags=["dev"])


class DevLoginRequest(BaseModel):
    email: str
    role: str = "architect"   # architect | contractor | homeowner | supplier


class DevLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    email: str


@router.post("/login", response_model=DevLoginResponse)
async def dev_login(body: DevLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Create or fetch a user by email and issue a JWT.
    Only available when ENVIRONMENT != 'production'.
    """
    if settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not found")

    # Upsert user
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=uuid.uuid4(),
            email=body.email,
            full_name=body.email.split("@")[0],
            role=body.role,
        )
        db.add(user)
        await db.flush()
    else:
        # Update role if changed
        if user.role != body.role:
            user.role = body.role
            await db.flush()

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
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return DevLoginResponse(
        access_token=token,
        role=user.role,
        user_id=str(user.id),
        email=user.email,
    )
