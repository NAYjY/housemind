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
    """Fetch a single non-deleted project image."""
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.id == image_id,
            ProjectImage.deleted_at.is_(None),   # ← soft-delete guard
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_active_images(
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
    Returns the updated model or None if not found.
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


# ---------------------------------------------------------------------------
# Annotation helpers
# ---------------------------------------------------------------------------


async def get_active_annotation(
    session: AsyncSession, annotation_id: uuid.UUID
) -> Annotation | None:
    """Fetch a single non-deleted annotation."""
    stmt = (
        select(Annotation)
        .where(
            Annotation.id == annotation_id,
            Annotation.deleted_at.is_(None),     # ← soft-delete guard
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
    """
    Soft-delete one annotation.
    Returns updated model or None if already deleted / not found.
    """
    ann = await get_active_annotation(session, annotation_id)
    if ann is None:
        return None
    ann.soft_delete()
    await session.flush()
    return ann
