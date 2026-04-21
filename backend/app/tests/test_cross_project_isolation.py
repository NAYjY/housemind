"""
app/tests/test_cross_project_isolation.py — HouseMind
Regression tests for cross-project IDOR (Insecure Direct Object Reference).

Each test documents a concrete attack scenario:
  Architect A owns project_A.
  Architect B owns project_B with resources inside it.
  The test asserts that A cannot mutate B's resources by supplying
  A's project_id alongside B's resource id.

These tests MUST remain in the suite.  A passing build that regresses any of
these means the IDOR fix has been silently reverted.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.project import Project
from app.models.project_image import ProjectImage
from app.models.user import User


# ── Seed helpers ──────────────────────────────────────────────────────────────

async def _make_architect(db: AsyncSession, email: str) -> tuple[User, str]:
    """Create an architect user and return (user, jwt_token)."""
    from app.api.v1.auth import _issue_token
    user = User(
        id=uuid.uuid4(),
        email=email,
        full_name="Test Architect",
        role="architect",
    )
    db.add(user)
    await db.flush()
    return user, _issue_token(user)


async def _make_project(db: AsyncSession, architect_id: uuid.UUID) -> Project:
    project = Project(
        id=uuid.uuid4(),
        architect_id=architect_id,
        name="Test Project",
        status="active",
    )
    db.add(project)
    await db.flush()
    return project


async def _make_image(db: AsyncSession, project_id: uuid.UUID) -> ProjectImage:
    image = ProjectImage(
        id=uuid.uuid4(),
        project_id=project_id,
        s3_key="projects/test/image.jpg",
        s3_bucket="test-bucket",
        mime_type="image/jpeg",
    )
    db.add(image)
    await db.flush()
    return image


async def _make_annotation(
    db: AsyncSession,
    image_id: uuid.UUID,
    created_by: uuid.UUID,
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


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestAnnotationCrossProjectIsolation:
    """
    Architect A must not be able to mutate Architect B's annotations by
    supplying A's project_id alongside B's annotation_id.
    """

    @pytest.mark.asyncio
    async def test_delete_annotation_from_other_project_is_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """
        Attack: DELETE /annotations/{b_ann}?project_id={a_project}
        Expect: 404 — the annotation does not belong to a_project.
        """
        user_a, token_a = await _make_architect(db_session, "a-delete@test.com")
        user_b, token_b = await _make_architect(db_session, "b-delete@test.com")

        project_a = await _make_project(db_session, user_a.id)
        project_b = await _make_project(db_session, user_b.id)
        image_b = await _make_image(db_session, project_b.id)
        ann_b = await _make_annotation(db_session, image_b.id, user_b.id)

        # Architect A attempts to delete B's annotation using A's project_id
        res = await client.delete(
            f"/v1/annotations/{ann_b.id}",
            params={"project_id": str(project_a.id)},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 404, (
            f"Expected 404 (cross-project IDOR blocked) but got {res.status_code}. "
            "The annotation was deleted from another architect's project."
        )

        # Confirm B's annotation is still alive in the DB
        await db_session.refresh(ann_b)
        assert ann_b.deleted_at is None, "Annotation was soft-deleted despite belonging to another project"

    @pytest.mark.asyncio
    async def test_move_annotation_from_other_project_is_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """
        Attack: PATCH /annotations/{b_ann}/move?project_id={a_project}
        Expect: 404 — the annotation does not belong to a_project.
        """
        user_a, token_a = await _make_architect(db_session, "a-move@test.com")
        user_b, token_b = await _make_architect(db_session, "b-move@test.com")

        project_a = await _make_project(db_session, user_a.id)
        project_b = await _make_project(db_session, user_b.id)
        image_b = await _make_image(db_session, project_b.id)
        ann_b = await _make_annotation(db_session, image_b.id, user_b.id)

        original_x = ann_b.position_x
        original_y = ann_b.position_y

        res = await client.patch(
            f"/v1/annotations/{ann_b.id}/move",
            params={"project_id": str(project_a.id)},
            json={"position_x": 0.9, "position_y": 0.9},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 404, (
            f"Expected 404 (cross-project IDOR blocked) but got {res.status_code}. "
            "The annotation was moved from another architect's project."
        )

        # Confirm position is unchanged
        await db_session.refresh(ann_b)
        assert ann_b.position_x == pytest.approx(original_x)
        assert ann_b.position_y == pytest.approx(original_y)

    @pytest.mark.asyncio
    async def test_create_annotation_on_foreign_image_is_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """
        Attack: POST /annotations?project_id={a_project} with body.image_id from project_b.
        Expect: 404 — the image does not belong to a_project.

        Without the fix an architect could pin annotations onto images they don't own.
        """
        user_a, token_a = await _make_architect(db_session, "a-create@test.com")
        user_b, token_b = await _make_architect(db_session, "b-create@test.com")

        project_a = await _make_project(db_session, user_a.id)
        project_b = await _make_project(db_session, user_b.id)
        image_b = await _make_image(db_session, project_b.id)

        res = await client.post(
            "/v1/annotations",
            params={"project_id": str(project_a.id)},
            json={
                "image_id": str(image_b.id),
                "object_id": 101,
                "position_x": 0.5,
                "position_y": 0.5,
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 404, (
            f"Expected 404 (cross-project IDOR blocked) but got {res.status_code}. "
            "An annotation was created on an image owned by another architect."
        )

    @pytest.mark.asyncio
    async def test_create_annotation_on_own_image_succeeds(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Positive test: architect can annotate their own project's image."""
        user_a, token_a = await _make_architect(db_session, "a-own-create@test.com")
        project_a = await _make_project(db_session, user_a.id)
        image_a = await _make_image(db_session, project_a.id)

        res = await client.post(
            "/v1/annotations",
            params={"project_id": str(project_a.id)},
            json={
                "image_id": str(image_a.id),
                "object_id": 101,
                "position_x": 0.3,
                "position_y": 0.7,
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 201
        body = res.json()
        assert body["position_x"] == pytest.approx(0.3)
        assert body["position_y"] == pytest.approx(0.7)

    @pytest.mark.asyncio
    async def test_delete_own_annotation_succeeds(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Positive test: architect can delete their own annotation."""
        user_a, token_a = await _make_architect(db_session, "a-own-delete@test.com")
        project_a = await _make_project(db_session, user_a.id)
        image_a = await _make_image(db_session, project_a.id)
        ann_a = await _make_annotation(db_session, image_a.id, user_a.id)

        res = await client.delete(
            f"/v1/annotations/{ann_a.id}",
            params={"project_id": str(project_a.id)},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 204

        await db_session.refresh(ann_a)
        assert ann_a.deleted_at is not None


class TestImageCrossProjectIsolation:
    """
    Architect A must not be able to delete Architect B's images (and cascade
    to their annotations) by supplying A's project_id alongside B's image_id.
    """

    @pytest.mark.asyncio
    async def test_delete_image_from_other_project_is_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """
        Attack: DELETE /images/{b_image}?project_id={a_project}
        Expect: 404 — the image does not belong to a_project.

        This is the highest-severity variant: a single request soft-deletes
        the image AND all its annotations (cascade), so every annotation
        in B's image is destroyed.
        """
        user_a, token_a = await _make_architect(db_session, "a-img-delete@test.com")
        user_b, token_b = await _make_architect(db_session, "b-img-delete@test.com")

        project_a = await _make_project(db_session, user_a.id)
        project_b = await _make_project(db_session, user_b.id)
        image_b = await _make_image(db_session, project_b.id)
        # Create an annotation on B's image to verify the cascade doesn't fire
        ann_b = await _make_annotation(db_session, image_b.id, user_b.id)

        res = await client.delete(
            f"/v1/images/{image_b.id}",
            params={"project_id": str(project_a.id)},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 404, (
            f"Expected 404 (cross-project IDOR blocked) but got {res.status_code}. "
            "An image was deleted from another architect's project."
        )

        # Confirm B's image and annotation are still alive
        await db_session.refresh(image_b)
        await db_session.refresh(ann_b)
        assert image_b.deleted_at is None, "Image was soft-deleted despite belonging to another project"
        assert ann_b.deleted_at is None, "Cascaded annotation delete fired despite cross-project IDOR block"

    @pytest.mark.asyncio
    async def test_delete_own_image_succeeds(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Positive test: architect can delete their own image."""
        user_a, token_a = await _make_architect(db_session, "a-own-img-delete@test.com")
        project_a = await _make_project(db_session, user_a.id)
        image_a = await _make_image(db_session, project_a.id)
        ann_a = await _make_annotation(db_session, image_a.id, user_a.id)

        res = await client.delete(
            f"/v1/images/{image_a.id}",
            params={"project_id": str(project_a.id)},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 204

        await db_session.refresh(image_a)
        await db_session.refresh(ann_a)
        assert image_a.deleted_at is not None
        assert ann_a.deleted_at is not None, "Expected cascade delete on image's annotation"

    @pytest.mark.asyncio
    async def test_delete_image_missing_project_id_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """
        Omitting project_id entirely must be rejected (422 validation error).
        require_project_owner needs project_id to do the ownership check.
        """
        user_a, token_a = await _make_architect(db_session, "a-no-proj@test.com")
        project_a = await _make_project(db_session, user_a.id)
        image_a = await _make_image(db_session, project_a.id)

        res = await client.delete(
            f"/v1/images/{image_a.id}",
            # No project_id query param
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 422