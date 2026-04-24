"""
app/schemas/auth.py — HouseMind
"""
from __future__ import annotations

import re
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(pattern=r"^(architect|contractor|homeowner|supplier)$")

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class InviteCreateRequest(BaseModel):
    """Architect adds an existing registered user to a project."""
    project_id: UUID
    user_id: UUID
    role: str = Field(pattern=r"^(contractor|homeowner|supplier)$")


class InviteCreateResponse(BaseModel):
    project_id: UUID
    user_id: UUID
    role: str
    status: str  # "added"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    user_id: str