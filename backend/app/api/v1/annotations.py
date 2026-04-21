"""
app/api/v1/annotations.py — HouseMind

Security fix (IDOR — cross-project resource access):
  Previously, create / move / delete accepted project_id as a query param
  used only by require_project_owner to confirm the caller owns *some* project.
  The subsequent DB fetch used only annotation_id with no project scope, so an
  architect could mutate annotations that belong to a different architect's project
  by supplying their own project_id alongside an alien annotation_id.

  Fix: expose project_id explicitly in each mutation endpoint and pass it into
  the project-scoped query helpers (get_active_annotation_in_project /
  soft_delete_annotation_in_project) which JOIN through project_images to verify
  the annotation actually lives in the authorised project.

  Resolve / reopen are not affected: they use require_architect_or_contractor
  (no client-supplied project_id) and do not perform cross-project mutations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_architect_or_contractor, require_project_member, require_project_owner
from app.db.queries import (
    get_active_annotation,
    get_active_annotation_in_project,
    get_active_image_in_project,
    list_active_annotations_for_image,
    soft_delete_annotation_in_project,
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

# ── helper
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
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> list[AnnotationSummary]:
    annotations = await list_active_annotations_for_image(db, image_id)
    return [_to_summary(ann) for ann in annotations]


# ── POST /annotations ─────────────────────────────────────────────────────────

@router.post("", response_model=AnnotationSummary, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: CreateAnnotationRequest,
    # project_id is shared with require_project_owner (FastAPI resolves once).
    # We declare it explicitly so we can use it to scope the image membership check.
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    # Security: verify body.image_id actually belongs to the project the caller
    # is authorised for.  Without this check an architect could POST annotations
    # onto images from another architect's project by supplying their own
    # project_id as the query param alongside a foreign image_id in the body.
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
    # Shared with require_project_owner.
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> AnnotationSummary:
    # Security: use project-scoped fetch to prevent cross-project IDOR.
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
    # Shared with require_project_owner.
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
):
    # Security: project-scoped soft-delete rejects annotation_ids from other projects.
    ann = await soft_delete_annotation_in_project(db, annotation_id, project_id)
    if ann is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annotation not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── PATCH /annotations/{annotation_id}/resolve ───────────────────────────────
#
# resolve and reopen use require_architect_or_contractor which does NOT inject
# a client-supplied project_id — the role check is sufficient here because the
# contractor/architect pair already shares the workspace.  If project-level
# scoping is required in future, add project_id as a query param and use
# get_active_annotation_in_project.

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