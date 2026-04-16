"""
app/tests/test_annotations.py — HouseMind
Unit tests for annotation CRUD, role guards, and resolve/reopen.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.project import Project
from app.models.project_image import ProjectImage
from app.models.user import User
from app.db.queries import get_active_annotation as _get_annotation


async def _seed_project(db: AsyncSession, architect_id: uuid.UUID) -> tuple[Project, ProjectImage]:
    project = Project(id=uuid.uuid4(), architect_id=architect_id, name="Test Project")
    db.add(project)
    await db.flush()

    image = ProjectImage(
        id=uuid.uuid4(),
        project_id=project.id,
        s3_key="projects/test/image.jpg",
        s3_bucket="housemind-test",
        mime_type="image/jpeg",
    )
    db.add(image)
    await db.flush()
    return project, image


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body


# ── Annotation list (read — all roles) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_list_annotations_requires_auth(client: AsyncClient, db_session: AsyncSession) -> None:
    res = await client.get("/v1/annotations", params={"image_id": str(uuid.uuid4())})
    assert res.status_code == 403  # no Bearer header


@pytest.mark.asyncio
async def test_list_annotations_homeowner_can_read(
    client: AsyncClient,
    db_session: AsyncSession,
    homeowner_token: str,
) -> None:
    res = await client.get(
        "/v1/annotations",
        params={"image_id": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {homeowner_token}"},
    )
    assert res.status_code == 200
    assert res.json() == []


# ── Create annotation (architect only) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_create_annotation_homeowner_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    homeowner_token: str,
) -> None:
    res = await client.post(
        "/v1/annotations",
        json={
            "image_id": str(uuid.uuid4()),
            "position_x": 0.5,
            "position_y": 0.5,
        },
        headers={"Authorization": f"Bearer {homeowner_token}"},
    )
    assert res.status_code == 403
    assert res.json()["error_code"] == "ACCESS_DENIED"


@pytest.mark.asyncio
async def test_create_annotation_architect_succeeds(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    # Decode token to get architect user_id
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])

    _, image = await _seed_project(db_session, architect_id)

    res = await client.post(
        "/v1/annotations",
        json={
            "image_id": str(image.id),
            "position_x": 0.42,
            "position_y": 0.71,
        },
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["position_x"] == pytest.approx(0.42)
    assert body["position_y"] == pytest.approx(0.71)
    assert body["resolved_at"] is None


# ── Soft delete ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_annotation_soft_deletes(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])

    _, image = await _seed_project(db_session, architect_id)

    # Create
    res = await client.post(
        "/v1/annotations",
        json={"image_id": str(image.id), "position_x": 0.3, "position_y": 0.3},
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 201
    ann_id = res.json()["id"]

    # Delete
    res = await client.delete(
        f"/v1/annotations/{ann_id}",
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 204

    # Should not appear in list
    res = await client.get(
        "/v1/annotations",
        params={"image_id": str(image.id)},
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert all(a["id"] != ann_id for a in res.json())

    # DB record still exists with deleted_at set
    ann = await db_session.get(Annotation, uuid.UUID(ann_id))
    assert ann is not None
    assert ann.deleted_at is not None


# ── Resolve / Reopen (architect + contractor only) ────────────────────────────

@pytest.mark.asyncio
async def test_resolve_annotation_contractor_allowed(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
    contractor_token: str,
) -> None:
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])
    _, image = await _seed_project(db_session, architect_id)

    # Architect creates annotation
    res = await client.post(
        "/v1/annotations",
        json={"image_id": str(image.id), "position_x": 0.5, "position_y": 0.5},
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    ann_id = res.json()["id"]

    # Contractor resolves it
    res = await client.patch(
        f"/v1/annotations/{ann_id}/resolve",
        json={},
        headers={"Authorization": f"Bearer {contractor_token}"},
    )
    assert res.status_code == 200
    assert res.json()["resolved_at"] is not None


@pytest.mark.asyncio
async def test_resolve_annotation_homeowner_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
    homeowner_token: str,
) -> None:
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])
    _, image = await _seed_project(db_session, architect_id)

    res = await client.post(
        "/v1/annotations",
        json={"image_id": str(image.id), "position_x": 0.5, "position_y": 0.5},
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    ann_id = res.json()["id"]

    res = await client.patch(
        f"/v1/annotations/{ann_id}/resolve",
        json={},
        headers={"Authorization": f"Bearer {homeowner_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_position_out_of_range_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    architect_token: str,
) -> None:
    import base64, json as _json
    payload = _json.loads(base64.b64decode(architect_token.split(".")[1] + "=="))
    architect_id = uuid.UUID(payload["user_id"])
    _, image = await _seed_project(db_session, architect_id)

    res = await client.post(
        "/v1/annotations",
        json={"image_id": str(image.id), "position_x": 1.5, "position_y": 0.5},
        headers={"Authorization": f"Bearer {architect_token}"},
    )
    assert res.status_code == 422
    assert res.json()["error_code"] == "VALIDATION_ERROR"
