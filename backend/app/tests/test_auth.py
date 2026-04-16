"""
app/tests/test_auth.py — HouseMind
Unit tests for magic-link invite creation and token redemption.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_redeem_valid_token(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    """Full invite → redeem flow."""
    import base64, json as _json

    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])

    # Seed a project for the invite
    from app.models.project import Project
    project = Project(id=uuid.uuid4(), architect_id=architect_id, name="Test")
    db_session.add(project)
    await db_session.flush()

    # Create invite
    res = await client.post(
        "/v1/invites",
        json={
            "project_id": str(project.id),
            "invitee_email": "homeowner@test-redeem.com",
            "invitee_role": "homeowner",
        },
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 201
    invite_id = res.json()["invite_id"]

    # Fetch token directly from DB (bypasses email in test)
    from app.models.invite_request import InviteRequest
    invite = await db_session.get(InviteRequest, uuid.UUID(invite_id))
    assert invite is not None
    token = invite.magic_link_token

    # Redeem
    res = await client.post("/v1/auth/redeem", json={"token": token})
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["role"] == "homeowner"


@pytest.mark.asyncio
async def test_redeem_invalid_token_rejected(client: AsyncClient) -> None:
    res = await client.post("/v1/auth/redeem", json={"token": "totally-fake-token"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_create_invite_homeowner_forbidden(
    client: AsyncClient,
    homeowner_token: str,
) -> None:
    res = await client.post(
        "/v1/invites",
        json={
            "project_id": str(uuid.uuid4()),
            "invitee_email": "x@x.com",
            "invitee_role": "homeowner",
        },
        headers={"Authorization": f"Bearer {homeowner_token}"},
    )
    assert res.status_code == 403
