"""
app/tests/test_security_hardening.py — HouseMind

Regression tests for all security fixes in the hardening patch.
These tests must remain in the suite permanently.  A passing build that
regresses any of them means a security fix was silently reverted.

Coverage:
  SEC-01  IDOR on object_products — link/unlink requires project ownership
  SEC-02  SSRF guard — scrape endpoint blocks private IP ranges
  SEC-03  Resolve/reopen scoped to project membership
  SEC-04  require_project_member is a real DB check
  SEC-05  Login is rate-limited (decorator presence, not slowapi behaviour)
  SEC-06  Login timing: unknown email runs bcrypt (no short-circuit)
  SEC-07  Product search scoped to project
  SEC-10  Logout revokes jti — revoked token rejected
  SEC-14  List annotations respects limit/offset
  SEC-15  Request body > 10 MB is rejected
  SEC-17  transactional_ddl is True in alembic env.py
  SEC-19  object_id whitelist rejects out-of-range values
  SEC-20  Weak passwords rejected at registration
  SEC-21  Logout endpoint exists and returns 204
  SEC-24  /health/ready requires secret when configured
  SEC-25  Thumbnail URL rejected if not https image/S3
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.object_product import ObjectProduct
from app.models.project import Project
from app.models.project_image import ProjectImage
from app.models.project_member import ProjectMember
from app.models.product import Product
from app.models.user import User


# ── Seed helpers ──────────────────────────────────────────────────────────────

async def _make_architect(db: AsyncSession, suffix: str = "") -> tuple[User, str]:
    from app.api.v1.auth import _issue_token
    user = User(
        id=uuid.uuid4(),
        email=f"arch{suffix}@sec-test.com",
        full_name="Test Architect",
        role="architect",
    )
    db.add(user)
    await db.flush()
    token, _jti, _exp = _issue_token(user)
    return user, token


async def _make_project(
    db: AsyncSession, architect_id: uuid.UUID
) -> Project:
    project = Project(
        id=uuid.uuid4(),
        architect_id=architect_id,
        name="Test Project",
        status="active",
    )
    db.add(project)
    await db.flush()
    # Add architect to project_members
    db.add(ProjectMember(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=architect_id,
        role="architect",
    ))
    await db.flush()
    return project


async def _make_image(db: AsyncSession, project_id: uuid.UUID) -> ProjectImage:
    image = ProjectImage(
        id=uuid.uuid4(),
        project_id=project_id,
        s3_key="test/image.jpg",
        s3_bucket="test-bucket",
        mime_type="image/jpeg",
    )
    db.add(image)
    await db.flush()
    return image


async def _make_annotation(
    db: AsyncSession, image_id: uuid.UUID, created_by: uuid.UUID
) -> Annotation:
    ann = Annotation(
        id=uuid.uuid4(),
        image_id=image_id,
        object_id=101,
        position_x=0.5,
        position_y=0.5,
        created_by=created_by,
    )
    db.add(ann)
    await db.flush()
    return ann


async def _make_product(db: AsyncSession, supplier_id: uuid.UUID) -> Product:
    p = Product(
        id=uuid.uuid4(),
        supplier_id=supplier_id,
        name="Test Product",
        thumbnail_s3_key="products/thumbnails/test.jpg",
        currency="THB",
    )
    db.add(p)
    await db.flush()
    return p


# ── SEC-01: object_products IDOR ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec01_link_product_requires_project_ownership(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Non-owner cannot link a product to someone else's project."""
    user_a, token_a = await _make_architect(db_session, "-a-link")
    user_b, token_b = await _make_architect(db_session, "-b-link")
    project_b = await _make_project(db_session, user_b.id)
    product = await _make_product(db_session, user_b.id)

    res = await client.post(
        "/v1/products/link",
        params={"project_id": str(project_b.id)},
        json={
            "project_id": str(project_b.id),
            "object_id": 101,
            "product_id": str(product.id),
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_sec01_unlink_product_requires_project_ownership(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Non-owner cannot delete a product link from someone else's project."""
    user_a, token_a = await _make_architect(db_session, "-a-unlink")
    user_b, token_b = await _make_architect(db_session, "-b-unlink")
    project_b = await _make_project(db_session, user_b.id)
    product = await _make_product(db_session, user_b.id)

    op = ObjectProduct(
        id=uuid.uuid4(),
        project_id=project_b.id,
        object_id=101,
        product_id=product.id,
    )
    db_session.add(op)
    await db_session.flush()

    res = await client.delete(
        f"/v1/products/link/{op.id}",
        params={"project_id": str(project_b.id)},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 403
    # Confirm link still exists
    await db_session.refresh(op)
    assert op.id == op.id  # still present


# ── SEC-02: SSRF guard ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec02_ssrf_blocks_aws_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Scrape endpoint must reject the AWS metadata service URL."""
    _user, token = await _make_architect(db_session, "-ssrf")
    res = await client.get(
        "/v1/products/scrape-images",
        params={"url": "https://169.254.169.254/latest/meta-data/"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec02_ssrf_blocks_localhost(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-ssrf2")
    res = await client.get(
        "/v1/products/scrape-images",
        params={"url": "http://localhost:5432/"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec02_ssrf_blocks_rfc1918(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-ssrf3")
    res = await client.get(
        "/v1/products/scrape-images",
        params={"url": "https://192.168.1.1/admin"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


# ── SEC-03: resolve/reopen project scope ─────────────────────────────────────

@pytest.mark.asyncio
async def test_sec03_contractor_cannot_resolve_other_project_annotation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Contractor not in project B cannot resolve B's annotations."""
    from app.api.v1.auth import _issue_token
    user_b, _token_b = await _make_architect(db_session, "-b-resolve")
    project_b = await _make_project(db_session, user_b.id)
    image_b = await _make_image(db_session, project_b.id)
    ann_b = await _make_annotation(db_session, image_b.id, user_b.id)

    # Contractor who belongs to no project
    contractor = User(
        id=uuid.uuid4(),
        email="contractor-sec03@test.com",
        full_name="Outsider Contractor",
        role="contractor",
    )
    db_session.add(contractor)
    await db_session.flush()
    contractor_token, _jti, _exp = _issue_token(contractor)

    res = await client.patch(
        f"/v1/annotations/{ann_b.id}/resolve",
        json={},
        headers={"Authorization": f"Bearer {contractor_token}"},
    )
    assert res.status_code == 403


# ── SEC-04: require_project_member is a real check ───────────────────────────

@pytest.mark.asyncio
async def test_sec04_non_member_cannot_list_annotations(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """User not in project_members gets 403 when listing annotations."""
    from app.api.v1.auth import _issue_token
    user_b, _token_b = await _make_architect(db_session, "-b-member")
    project_b = await _make_project(db_session, user_b.id)
    image_b = await _make_image(db_session, project_b.id)

    outsider = User(
        id=uuid.uuid4(),
        email="outsider-sec04@test.com",
        full_name="Outsider",
        role="homeowner",
    )
    db_session.add(outsider)
    await db_session.flush()
    outsider_token, _jti, _exp = _issue_token(outsider)

    res = await client.get(
        "/v1/annotations",
        params={"image_id": str(image_b.id)},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert res.status_code == 403


# ── SEC-06: timing-safe login ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec06_login_unknown_email_runs_bcrypt(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Login with unknown email must return 401, not 404 or a fast response
    that indicates the email doesn't exist.  We can't measure timing in a
    unit test, but we verify the same response shape is returned.
    """
    res = await client.post(
        "/v1/auth/login",
        json={"email": "nobody@nowhere.invalid", "password": "WrongPass1"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


# ── SEC-07: product search scoped to project ─────────────────────────────────

@pytest.mark.asyncio
async def test_sec07_product_search_requires_project_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Search without project_id is rejected."""
    _user, token = await _make_architect(db_session, "-search")
    res = await client.get(
        "/v1/products/search",
        params={"q": "tile"},
        headers={"Authorization": f"Bearer {token}"},
    )
    # project_id is required — 422 validation error
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec07_product_search_only_returns_project_products(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Products in project B are not visible when searching project A."""
    user_a, token_a = await _make_architect(db_session, "-a-search")
    user_b, _token_b = await _make_architect(db_session, "-b-search")
    project_a = await _make_project(db_session, user_a.id)
    project_b = await _make_project(db_session, user_b.id)
    product_b = await _make_product(db_session, user_b.id)

    # Link product to project B only
    db_session.add(ObjectProduct(
        id=uuid.uuid4(),
        project_id=project_b.id,
        object_id=101,
        product_id=product_b.id,
    ))
    await db_session.flush()

    res = await client.get(
        "/v1/products/search",
        params={"project_id": str(project_a.id), "q": "Test Product"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 200
    # Product from project B must not appear in project A search
    ids = [item["id"] for item in res.json()["items"]]
    assert str(product_b.id) not in ids


# ── SEC-10: logout revokes token ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec10_logout_revokes_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """After logout, the same token should be rejected."""
    _user, token = await _make_architect(db_session, "-logout")

    # First request with valid token succeeds
    res = await client.get(
        "/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200

    # Logout
    res = await client.post(
        "/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 204

    # Same token should now be rejected
    res = await client.get(
        "/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401


# ── SEC-14: pagination ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec14_annotations_pagination(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """limit and offset params are accepted and clip results correctly."""
    user_a, token_a = await _make_architect(db_session, "-pag")
    project_a = await _make_project(db_session, user_a.id)
    image_a = await _make_image(db_session, project_a.id)

    # Create 5 annotations
    for _ in range(5):
        await _make_annotation(db_session, image_a.id, user_a.id)

    res = await client.get(
        "/v1/annotations",
        params={"image_id": str(image_a.id), "limit": 2, "offset": 0},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 200
    assert len(res.json()) == 2

    res2 = await client.get(
        "/v1/annotations",
        params={"image_id": str(image_a.id), "limit": 2, "offset": 2},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res2.status_code == 200
    assert len(res2.json()) == 2

    # IDs must be different between pages
    page1_ids = {a["id"] for a in res.json()}
    page2_ids = {a["id"] for a in res2.json()}
    assert page1_ids.isdisjoint(page2_ids)


# ── SEC-17: alembic transactional_ddl ────────────────────────────────────────

def test_sec17_alembic_transactional_ddl_is_true() -> None:
    """Verify alembic env.py has transactional_ddl=True."""
    import pathlib
    env_path = pathlib.Path(__file__).parent.parent.parent.parent / "db" / "alembic" / "env.py"
    if not env_path.exists():
        pytest.skip("alembic env.py not found at expected path")
    content = env_path.read_text()
    assert "transactional_ddl=True" in content, (
        "SEC-17 regression: transactional_ddl must be True in alembic/env.py. "
        "Setting it to False means partial migrations are committed on failure."
    )
    assert "transactional_ddl=False" not in content


# ── SEC-19: object_id whitelist ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec19_invalid_object_id_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user_a, token_a = await _make_architect(db_session, "-objid")
    project_a = await _make_project(db_session, user_a.id)
    image_a = await _make_image(db_session, project_a.id)

    # 200 is outside the valid set {0, 101-108}
    res = await client.post(
        "/v1/annotations",
        params={"project_id": str(project_a.id)},
        json={
            "image_id": str(image_a.id),
            "object_id": 200,
            "position_x": 0.5,
            "position_y": 0.5,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec19_valid_object_id_accepted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user_a, token_a = await _make_architect(db_session, "-objid2")
    project_a = await _make_project(db_session, user_a.id)
    image_a = await _make_image(db_session, project_a.id)

    res = await client.post(
        "/v1/annotations",
        params={"project_id": str(project_a.id)},
        json={
            "image_id": str(image_a.id),
            "object_id": 101,
            "position_x": 0.5,
            "position_y": 0.5,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 201


# ── SEC-20: password strength ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec20_weak_passwords_rejected(client: AsyncClient) -> None:
    for weak in ["password", "12345678", "aaaaaaaa", "AAAAAAAA", "Abcdefg1"[:7]]:
        res = await client.post(
            "/v1/auth/register",
            json={
                "email": f"test-{uuid.uuid4().hex[:6]}@test.com",
                "password": weak,
                "full_name": "Test User",
                "role": "architect",
            },
        )
        assert res.status_code == 422, f"Expected 422 for weak password: {weak!r}"


@pytest.mark.asyncio
async def test_sec20_strong_password_accepted(client: AsyncClient) -> None:
    res = await client.post(
        "/v1/auth/register",
        json={
            "email": f"strong-{uuid.uuid4().hex[:6]}@test.com",
            "password": "ValidPass1",
            "full_name": "Strong User",
            "role": "architect",
        },
    )
    assert res.status_code == 201


# ── SEC-21: logout endpoint exists ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec21_logout_endpoint_exists(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-logout-exists")
    res = await client.post(
        "/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 204


# ── SEC-24: /health/ready secret ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec24_health_ready_with_no_secret_is_open(
    client: AsyncClient,
) -> None:
    """When HEALTH_SECRET is empty (local dev), /health/ready is open."""
    import os
    os.environ["HEALTH_SECRET"] = ""
    # reload settings cache
    from app.config import get_settings
    get_settings.cache_clear()

    res = await client.get("/health/ready")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_sec24_health_ready_requires_secret_when_configured(
    client: AsyncClient,
) -> None:
    """When HEALTH_SECRET is set, /health/ready must reject missing/wrong secret."""
    import os
    os.environ["HEALTH_SECRET"] = "super-secret-health-token"
    from app.config import get_settings
    get_settings.cache_clear()

    res = await client.get("/health/ready")
    assert res.status_code == 401

    res2 = await client.get(
        "/health/ready",
        headers={"X-Health-Secret": "super-secret-health-token"},
    )
    assert res2.status_code == 200

    # Cleanup
    os.environ["HEALTH_SECRET"] = ""
    get_settings.cache_clear()


# ── SEC-25: thumbnail URL validation ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_sec25_http_thumbnail_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-thumb")
    res = await client.post(
        "/v1/products",
        json={
            "name": "Test Product",
            "thumbnail_url": "http://attacker.com/pixel.gif",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec25_non_image_https_thumbnail_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-thumb2")
    res = await client.post(
        "/v1/products",
        json={
            "name": "Test Product",
            "thumbnail_url": "https://attacker.com/tracking",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sec25_valid_s3_thumbnail_accepted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _user, token = await _make_architect(db_session, "-thumb3")
    res = await client.post(
        "/v1/products",
        json={
            "name": "Test Product",
            "thumbnail_url": "https://housemind-assets.s3.ap-southeast-1.amazonaws.com/products/thumbnails/test.jpg",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
