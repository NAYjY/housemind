"""
app/api/v1/annotations.py — HouseMind
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_architect_or_contractor, require_project_member, require_project_owner
from app.db.queries import (
    get_active_annotation,
    list_active_annotations_for_image,
    soft_delete_annotation,
)
from app.db.session import get_db
from app.models.annotation import Annotation
from app.schemas.annotation import (
    AnnotationDetail,
    AnnotationSummary,
    AnnotationUpdateRequest,
    CreateAnnotationRequest,
    ResolveAnnotationRequest,
)

router = APIRouter(prefix="/annotations", tags=["annotations"])


# ── GET /annotations?image_id=<uuid> ─────────────────────────────────────────

@router.get("", response_model=list[AnnotationSummary])
async def list_annotations(
    image_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> list[AnnotationSummary]:
    annotations = await list_active_annotations_for_image(db, image_id)
    return [
        AnnotationSummary(
            id=ann.id,
            image_id=ann.image_id,
            object_id=ann.object_id,
            position_x=ann.position_x,
            position_y=ann.position_y,
            created_by=ann.created_by,
            created_at=ann.created_at,
            resolved_at=ann.resolved_at,
            resolved_by=ann.resolved_by,
        )
        for ann in annotations
    ]


# ── POST /annotations ─────────────────────────────────────────────────────────

@router.post("", response_model=AnnotationSummary, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: CreateAnnotationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    ann = Annotation(
        id=uuid.uuid4(),
        image_id=body.image_id,
        object_id=body.object_id,
        position_x=body.position_x,
        position_y=body.position_y,
        label=body.label,
        note=body.note,
        created_by=uuid.UUID(user["user_id"]),
    )
    db.add(ann)
    await db.flush()

    return AnnotationSummary(
        id=ann.id,
        image_id=ann.image_id,
        object_id=ann.object_id,
        position_x=ann.position_x,
        position_y=ann.position_y,
        created_by=ann.created_by,
        created_at=ann.created_at,
        resolved_at=None,
        resolved_by=None,
    )


# ── PATCH /annotations/{annotation_id}/move ──────────────────────────────────

@router.patch("/{annotation_id}/move", response_model=AnnotationSummary)
async def move_annotation(
    annotation_id: uuid.UUID,
    body: AnnotationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    if body.position_x is not None:
        ann.position_x = body.position_x
    if body.position_y is not None:
        ann.position_y = body.position_y

    await db.flush()

    return AnnotationSummary(
        id=ann.id,
        image_id=ann.image_id,
        object_id=ann.object_id,
        position_x=ann.position_x,
        position_y=ann.position_y,
        created_by=ann.created_by,
        created_at=ann.created_at,
        resolved_at=ann.resolved_at,
        resolved_by=ann.resolved_by,
    )


# ── DELETE /annotations/{annotation_id} ──────────────────────────────────────

@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
):
    ann = await soft_delete_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annotation not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── PATCH /annotations/{annotation_id}/resolve ───────────────────────────────

@router.patch("/{annotation_id}/resolve", response_model=AnnotationDetail)
async def resolve_annotation(
    annotation_id: uuid.UUID,
    body: ResolveAnnotationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect_or_contractor),
) -> AnnotationDetail:
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    if ann.resolved_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already resolved")

    ann.resolved_at = datetime.now(timezone.utc)
    ann.resolved_by = uuid.UUID(user["user_id"])
    if body.note:
        ann.note = body.note
    await db.flush()

    return AnnotationDetail(
        id=ann.id,
        image_id=ann.image_id,
        object_id=ann.object_id,
        position_x=ann.position_x,
        position_y=ann.position_y,
        created_by=ann.created_by,
        created_at=ann.created_at,
        resolved_at=ann.resolved_at,
        resolved_by=ann.resolved_by,
        label=ann.label,
        note=ann.note,
        updated_at=ann.updated_at,
    )


# ── PATCH /annotations/{annotation_id}/reopen ────────────────────────────────

@router.patch("/{annotation_id}/reopen", response_model=AnnotationDetail)
async def reopen_annotation(
    annotation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect_or_contractor),
) -> AnnotationDetail:
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    if ann.resolved_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not resolved")

    ann.resolved_at = None
    ann.resolved_by = None
    await db.flush()

    return AnnotationDetail(
        id=ann.id,
        image_id=ann.image_id,
        object_id=ann.object_id,
        position_x=ann.position_x,
        position_y=ann.position_y,
        created_by=ann.created_by,
        created_at=ann.created_at,
        resolved_at=None,
        resolved_by=None,
        label=ann.label,
        note=ann.note,
        updated_at=ann.updated_at,
    )