"""
app/db/queries.py — HouseMind

SEC-14 fix: list helpers now accept limit and offset parameters.
  Previously all list queries returned unbounded result sets.  A project with
  thousands of annotations would return them all in a single response, enabling
  memory exhaustion and slow response times.

All other contracts (soft-delete guard, project scope) are unchanged.
"""
from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.project_image import ProjectImage
from app.models.object_product import ObjectProduct

_DEFAULT_LIMIT = 200
_MAX_LIMIT = 1000


# ---------------------------------------------------------------------------
# ProjectImage helpers
# ---------------------------------------------------------------------------


async def get_active_image(
    session: AsyncSession, image_id: uuid.UUID
) -> ProjectImage | None:
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.id == image_id,
            ProjectImage.deleted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_image_in_project(
    session: AsyncSession,
    image_id: uuid.UUID,
    project_id: uuid.UUID,
) -> ProjectImage | None:
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.id == image_id,
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_active_images_for_project(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int = _DEFAULT_LIMIT,   # SEC-14
    offset: int = 0,
) -> Sequence[ProjectImage]:
    limit = min(limit, _MAX_LIMIT)
    stmt = (
        select(ProjectImage)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),
        )
        .order_by(ProjectImage.display_order, ProjectImage.created_at)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def soft_delete_image(
    session: AsyncSession, image_id: uuid.UUID
) -> ProjectImage | None:
    image = await get_active_image(session, image_id)
    if image is None:
        return None
    image.soft_delete()
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
    image = await get_active_image_in_project(session, image_id, project_id)
    if image is None:
        return None
    image.soft_delete()
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
    stmt = (
        select(Annotation)
        .where(
            Annotation.id == annotation_id,
            Annotation.deleted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_annotation_in_project(
    session: AsyncSession,
    annotation_id: uuid.UUID,
    project_id: uuid.UUID,
) -> Annotation | None:
    stmt = (
        select(Annotation)
        .join(ProjectImage, Annotation.image_id == ProjectImage.id)
        .where(
            Annotation.id == annotation_id,
            Annotation.deleted_at.is_(None),
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_active_annotations_for_image(
    session: AsyncSession,
    image_id: uuid.UUID,
    limit: int = _DEFAULT_LIMIT,   # SEC-14
    offset: int = 0,
) -> Sequence[Annotation]:
    limit = min(limit, _MAX_LIMIT)
    stmt = (
        select(Annotation)
        .where(
            Annotation.image_id == image_id,
            Annotation.deleted_at.is_(None),
        )
        .order_by(Annotation.created_at)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def list_active_annotations_for_project(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> Sequence[Annotation]:
    limit = min(limit, _MAX_LIMIT)
    stmt = (
        select(Annotation)
        .join(ProjectImage, Annotation.image_id == ProjectImage.id)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),
            Annotation.deleted_at.is_(None),
        )
        .order_by(Annotation.created_at)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()

async def _cleanup_object_products_if_last(
    session: AsyncSession,
    project_id: uuid.UUID,
    object_id: int,
    excluded_annotation_id: uuid.UUID,
) -> None:
    """Remove object_product links when no other active annotation uses this object_id."""
    remaining_stmt = (
        select(Annotation)
        .join(ProjectImage, Annotation.image_id == ProjectImage.id)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.deleted_at.is_(None),
            Annotation.deleted_at.is_(None),
            Annotation.object_id == object_id,
            Annotation.id != excluded_annotation_id,
        )
        .limit(1)
    )
    remaining = (await session.execute(remaining_stmt)).scalar_one_or_none()
    if remaining is not None:
        return

    op_stmt = select(ObjectProduct).where(
        ObjectProduct.project_id == project_id,
        ObjectProduct.object_id == object_id,
    )
    for op in (await session.execute(op_stmt)).scalars().all():
        await session.delete(op)
    await session.flush()

async def soft_delete_annotation(
    session: AsyncSession, annotation_id: uuid.UUID
) -> Annotation | None:
    ann = await get_active_annotation(session, annotation_id)
    if ann is None:
        return None

    # Need project_id to clean up object_products
    
    img_stmt = select(ProjectImage).where(ProjectImage.id == ann.image_id)
    img = (await session.execute(img_stmt)).scalar_one_or_none()
    project_id = img.project_id if img else None
    object_id = ann.object_id

    ann.soft_delete()
    await session.flush()

    if project_id and object_id:
        await _cleanup_object_products_if_last(session, project_id, object_id, annotation_id)

    return ann


async def soft_delete_annotation_in_project(
    session: AsyncSession,
    annotation_id: uuid.UUID,
    project_id: uuid.UUID,
) -> Annotation | None:
    ann = await get_active_annotation_in_project(session, annotation_id, project_id)
    if ann is None:
        return None
    object_id = ann.object_id
    ann.soft_delete()
    await session.flush()

    # After soft-deleting, check if any OTHER active annotation in this project
    # still uses the same object_id. If not, remove the object_products link.
    if object_id:
        await _cleanup_object_products_if_last(session, project_id, object_id, annotation_id)

    return ann
