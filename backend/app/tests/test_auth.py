"""
app/tests/test_auth.py — HouseMind
Unit tests for the direct-invite auth flow (magic-link flow removed in migration 004).
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User


async def _make_architect(db: AsyncSession) -> tuple[User, str]:
    from app.api.v1.auth import _issue_token
    user = User(
        id=uuid.uuid4(),
        email=f"arch-{uuid.uuid4().hex[:6]}@test.com",
        full_name="Test Architect",
        role="architect",
        password_hash="$2b$12$placeholder",
    )
    db.add(user)
    await db.flush()
    token, _jti, _exp = _issue_token(user)
    return user, token


@pytest.mark.asyncio
async def test_create_invite_homeowner_forbidden(
    client: AsyncClient,
    homeowner_token: str,
) -> None:
    """Non-architect cannot add members to a project."""
    res = await client.post(
        "/v1/invites",
        json={
            "project_id": str(uuid.uuid4()),
            "user_id": str(uuid.uuid4()),
            "role": "homeowner",
        },
        headers={"Authorization": f"Bearer {homeowner_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_invite_architect_adds_member(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    """Architect can add an existing user to their own project."""
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])

    # Seed a project owned by the architect
    project = Project(id=uuid.uuid4(), architect_id=architect_id, name="Test")
    db_session.add(project)
    # Architect must be a project_member for ownership check
    db_session.add(ProjectMember(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=architect_id,
        role="architect",
    ))
    await db_session.flush()

    # Seed the target user
    target = User(
        id=uuid.uuid4(),
        email=f"target-{uuid.uuid4().hex[:6]}@test.com",
        full_name="Target User",
        role="contractor",
        password_hash="$2b$12$placeholder",
    )
    db_session.add(target)
    await db_session.flush()

    res = await client.post(
        "/v1/invites",
        json={
            "project_id": str(project.id),
            "user_id": str(target.id),
            "role": "contractor",
        },
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "added"
    assert body["role"] == "contractor"


@pytest.mark.asyncio
async def test_create_invite_duplicate_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    """Adding the same user twice returns 409."""
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])

    project = Project(id=uuid.uuid4(), architect_id=architect_id, name="Test Dup")
    db_session.add(project)
    db_session.add(ProjectMember(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=architect_id,
        role="architect",
    ))
    await db_session.flush()

    target = User(
        id=uuid.uuid4(),
        email=f"dup-{uuid.uuid4().hex[:6]}@test.com",
        full_name="Dup User",
        role="homeowner",
        password_hash="$2b$12$placeholder",
    )
    db_session.add(target)
    await db_session.flush()

    for expected in [201, 409]:
        res = await client.post(
            "/v1/invites",
            json={
                "project_id": str(project.id),
                "user_id": str(target.id),
                "role": "homeowner",
            },
            headers={"Authorization": f"Bearer {architect_token}"},
        )
        assert res.status_code == expected


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient) -> None:
    """Register a new user, then log in and receive a token."""
    email = f"newuser-{uuid.uuid4().hex[:6]}@test.com"

    reg = await client.post(
        "/v1/auth/register",
        json={"email": email, "password": "ValidPass1", "full_name": "New User", "role": "architect"},
    )
    assert reg.status_code == 201
    assert reg.json()["role"] == "architect"

    login = await client.post(
        "/v1/auth/login",
        json={"email": email, "password": "ValidPass1"},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()


@pytest.mark.asyncio
async def test_login_wrong_password_rejected(client: AsyncClient) -> None:
    res = await client.post(
        "/v1/auth/login",
        json={"email": "nobody@nowhere.invalid", "password": "WrongPass1"},
    )
    assert res.status_code == 401