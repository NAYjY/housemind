"""
app/api/v1/annotations.py — HouseMind

Security fixes applied:

SEC-03  resolve / reopen now use require_annotation_project_member.
        Previously they used require_architect_or_contractor with NO project
        scope — any contractor could resolve annotations in any project they
        had never been invited to.  The fix looks up the annotation's image
        → project, then checks the caller is a project member.

SEC-04  list_annotations now uses require_annotation_project_member
        (resolves project_id from image_id automatically).

SEC-14  Pagination added to list_annotations: limit (default 200, max 1000)
        and offset query params.  Prevents unbounded responses on large projects.

Previous IDOR fix (cross-project mutation) is preserved unchanged.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    require_annotation_project_member,
    require_architect_or_contractor,
    require_project_owner,
)
from app.db.queries import (
    get_active_annotation,
    get_active_annotation_in_project,
    get_active_image_in_project,
    list_active_annotations_for_image,
    soft_delete_annotation_in_project,
)
from app.db.session import get_db
from app.models.annotation import Annotation
from app.models.project_image import ProjectImage
from app.models.project_member import ProjectMember
from app.schemas.annotation import (
    AnnotationDetail,
    AnnotationSummary,
    AnnotationUpdateRequest,
    CreateAnnotationRequest,
    ResolveAnnotationRequest,
)
from sqlalchemy import select


def _to_summary(ann: Annotation) -> AnnotationSummary:
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


router = APIRouter(prefix="/annotations", tags=["annotations"])


# ── GET /annotations?image_id=<uuid> ─────────────────────────────────────────

@router.get("", response_model=list[AnnotationSummary])
async def list_annotations(
    image_id: uuid.UUID = Query(...),
    limit: int = Query(default=200, ge=1, le=1000),   # SEC-14: pagination
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_annotation_project_member),  # SEC-04
) -> list[AnnotationSummary]:
    annotations = await list_active_annotations_for_image(db, image_id, limit=limit, offset=offset)
    return [_to_summary(ann) for ann in annotations]


# ── POST /annotations ─────────────────────────────────────────────────────────

@router.post("", response_model=AnnotationSummary, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: CreateAnnotationRequest,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    image = await get_active_image_in_project(db, body.image_id, project_id)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found in this project",
        )

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
    return _to_summary(ann)


# ── PATCH /annotations/{annotation_id}/move ──────────────────────────────────

@router.patch("/{annotation_id}/move", response_model=AnnotationSummary)
async def move_annotation(
    annotation_id: uuid.UUID,
    body: AnnotationUpdateRequest,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    ann = await get_active_annotation_in_project(db, annotation_id, project_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    if body.position_x is not None:
        ann.position_x = body.position_x
    if body.position_y is not None:
        ann.position_y = body.position_y
    await db.flush()
    return _to_summary(ann)


# ── DELETE /annotations/{annotation_id} ──────────────────────────────────────

@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: uuid.UUID,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
):
    ann = await soft_delete_annotation_in_project(db, annotation_id, project_id)
    if ann is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annotation not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── PATCH /annotations/{annotation_id}/resolve ────────────────────────────────

@router.patch("/{annotation_id}/resolve", response_model=AnnotationDetail)
async def resolve_annotation(
    annotation_id: uuid.UUID,
    body: ResolveAnnotationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect_or_contractor),
) -> AnnotationDetail:
    """
    SEC-03 fix: verify the caller is a member of the project that owns
    this annotation before allowing the resolve.
    """
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    if ann.resolved_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already resolved")

    # SEC-03: check project membership via the annotation's image
    await _require_annotation_membership(db, ann, user)

    ann.resolved_at = datetime.now(timezone.utc)
    ann.resolved_by = uuid.UUID(user["user_id"])
    if body.note:
        ann.note = body.note
    await db.flush()

    return _to_detail(ann)


# ── PATCH /annotations/{annotation_id}/reopen ─────────────────────────────────

@router.patch("/{annotation_id}/reopen", response_model=AnnotationDetail)
async def reopen_annotation(
    annotation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect_or_contractor),
) -> AnnotationDetail:
    """
    SEC-03 fix: verify project membership before allowing reopen.
    """
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    if ann.resolved_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not resolved")

    # SEC-03: check project membership
    await _require_annotation_membership(db, ann, user)

    ann.resolved_at = None
    ann.resolved_by = None
    await db.flush()

    return _to_detail(ann)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_annotation_membership(
    db: AsyncSession,
    ann: Annotation,
    user: dict,
) -> None:
    """
    SEC-03: Verify that `user` is a member of the project that owns `ann`.
    Raises 403 if not.  Used by resolve and reopen endpoints.
    """
    img_result = await db.execute(
        select(ProjectImage.project_id).where(ProjectImage.id == ann.image_id)
    )
    row = img_result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    project_id = row[0]
    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == uuid.UUID(user["user_id"]),
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this project",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )


def _to_detail(ann: Annotation) -> AnnotationDetail:
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
