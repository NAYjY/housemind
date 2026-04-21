"""
app/db/queries.py — HouseMind
Query helpers that enforce soft-delete filtering.

RULE: Every SELECT on annotations or project_images MUST go through
these helpers — never query those tables directly without the
deleted_at IS NULL guard.

Soft-delete contract:
  - DELETE  → call model.soft_delete() then session.flush()
  - SELECT  → use the active_*() helpers below
  - NEVER   → expose a hard-delete endpoint to the API layer

Security contract:
  - Mutation helpers that accept resource IDs (annotation_id, image_id)
    MUST also accept project_id and verify membership via a JOIN.
    This prevents cross-project IDOR where an architect supplies their own
    project_id as the auth token but a resource ID from another project.
    Use get_active_annotation_in_project / get_active_image_in_project.
  - Read-only helpers (list_active_annotations_for_image) are safe because
    the image_id itself is the scope and was already fetched under a project.
"""
from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.project_image import ProjectImage


# ---------------------------------------------------------------------------
# ProjectImage helpers
# ---------------------------------------------------------------------------


async def get_active_image(
    session: AsyncSession, image_id: uuid.UUID
) -> ProjectImage | None:
    """Fetch a single non-deleted project image (no project scope check).

    Prefer get_active_image_in_project for mutation endpoints.
    This variant is safe for read paths where the caller has already
    established project membership (e.g. GET /images/{id}/url).
    """
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.id == image_id,
            ProjectImage.deleted_at.is_(None),   # ← soft-delete guard
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_image_in_project(
    session: AsyncSession,
    image_id: uuid.UUID,
    project_id: uuid.UUID,
) -> ProjectImage | None:
    """Fetch a non-deleted image, verifying it belongs to project_id.

    Use this in every mutation endpoint (DELETE, etc.) to prevent IDOR where
    an architect supplies their own project_id but an image_id from another
    project. Returns None if the image is deleted, missing, or belongs to a
    different project — the caller should raise 404 in all three cases (do
    not distinguish missing vs wrong-project to avoid information leakage).
    """
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.id == image_id,
            ProjectImage.project_id == project_id,   # ← project membership guard
            ProjectImage.deleted_at.is_(None),       # ← soft-delete guard
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_active_images_for_project(
    session: AsyncSession, project_id: uuid.UUID
) -> Sequence[ProjectImage]:
    """All non-deleted images for a project, ordered for display."""
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),   # ← soft-delete guard
        )
        .order_by(ProjectImage.display_order, ProjectImage.created_at)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def soft_delete_image(
    session: AsyncSession, image_id: uuid.UUID
) -> ProjectImage | None:
    """
    Soft-delete a project image and cascade to its annotations.

    NOTE: This variant does NOT check project membership. Call
    soft_delete_image_in_project from mutation endpoints instead.
    Retained for internal cascade use by soft_delete_image_in_project.
    """
    image = await get_active_image(session, image_id)
    if image is None:
        return None

    image.soft_delete()

    # Cascade soft-delete to all annotations on this image
    annotations = await list_active_annotations_for_image(session, image_id)
    for ann in annotations:
        ann.soft_delete()

    await session.flush()
    return image


async def soft_delete_image_in_project(
    session: AsyncSession,
    image_id: uuid.UUID,
    project_id: uuid.UUID,
) -> ProjectImage | None:
    """Soft-delete an image (+ annotation cascade) only if it belongs to project_id.

    Returns None if the image is missing, deleted, or belongs to a different
    project. Caller should always raise 404 on None — do not reveal which case
    triggered the None to avoid information leakage.
    """
    image = await get_active_image_in_project(session, image_id, project_id)
    if image is None:
        return None

    image.soft_delete()

    # Cascade soft-delete to all annotations on this image
    annotations = await list_active_annotations_for_image(session, image_id)
    for ann in annotations:
        ann.soft_delete()

    await session.flush()
    return image


# ---------------------------------------------------------------------------
# Annotation helpers
# ---------------------------------------------------------------------------


async def get_active_annotation(
    session: AsyncSession, annotation_id: uuid.UUID
) -> Annotation | None:
    """Fetch a single non-deleted annotation (no project scope check).

    Prefer get_active_annotation_in_project for mutation endpoints.
    This variant is safe for resolve/reopen endpoints that use
    require_architect_or_contractor (no client-supplied project_id).
    """
    stmt = (
        select(Annotation)
        .where(
            Annotation.id == annotation_id,
            Annotation.deleted_at.is_(None),     # ← soft-delete guard
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_annotation_in_project(
    session: AsyncSession,
    annotation_id: uuid.UUID,
    project_id: uuid.UUID,
) -> Annotation | None:
    """Fetch a non-deleted annotation, verifying it belongs to project_id.

    Joins through project_images to assert the annotation's image lives in
    project_id. Use in every mutation endpoint (move, delete) that accepts
    project_id as a query param — this closes the IDOR where an architect
    passes their own project_id alongside an annotation_id from another project.

    Returns None for missing, soft-deleted, or out-of-project annotations.
    Caller must raise 404 without distinguishing the cause.
    """
    stmt = (
        select(Annotation)
        .join(ProjectImage, Annotation.image_id == ProjectImage.id)
        .where(
            Annotation.id == annotation_id,
            Annotation.deleted_at.is_(None),         # ← soft-delete guard
            ProjectImage.project_id == project_id,   # ← project membership guard
            ProjectImage.deleted_at.is_(None),       # ← exclude deleted images
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_active_annotations_for_image(
    session: AsyncSession, image_id: uuid.UUID
) -> Sequence[Annotation]:
    """
    All non-deleted annotations for one image.
    Optimised for mobile: returns position + label only via this query.
    Full note text is fetched separately on tap (avoids large payloads).
    """
    stmt = (
        select(Annotation)
        .where(
            Annotation.image_id == image_id,
            Annotation.deleted_at.is_(None),     # ← soft-delete guard
        )
        .order_by(Annotation.created_at)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def list_active_annotations_for_project(
    session: AsyncSession, project_id: uuid.UUID
) -> Sequence[Annotation]:
    """
    All non-deleted annotations across an entire project.
    Uses the image_id index + join; avoid N+1 by fetching in one query.
    """
    stmt = (
        select(Annotation)
        .join(ProjectImage, Annotation.image_id == ProjectImage.id)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),   # ← exclude deleted images
            Annotation.deleted_at.is_(None),     # ← exclude deleted annotations
        )
        .order_by(Annotation.created_at)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def soft_delete_annotation(
    session: AsyncSession, annotation_id: uuid.UUID
) -> Annotation | None:
    """Soft-delete one annotation (no project scope check).

    NOTE: Use soft_delete_annotation_in_project from mutation endpoints.
    This unscoped variant is only called internally (e.g. image cascade).
    """
    ann = await get_active_annotation(session, annotation_id)
    if ann is None:
        return None
    ann.soft_delete()
    await session.flush()
    return ann


async def soft_delete_annotation_in_project(
    session: AsyncSession,
    annotation_id: uuid.UUID,
    project_id: uuid.UUID,
) -> Annotation | None:
    """Soft-delete an annotation only if it belongs to project_id.

    Returns None if the annotation is missing, deleted, or belongs to a
    different project. Caller must raise 404 on None.
    """
    ann = await get_active_annotation_in_project(session, annotation_id, project_id)
    if ann is None:
        return None
    ann.soft_delete()
    await session.flush()
    return ann