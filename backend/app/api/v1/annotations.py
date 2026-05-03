"""
app/api/v1/annotations.py — HouseMind
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    require_annotation_project_member,
    require_project_architect,
    require_resolver,
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
from app.models.annotation_resolution import AnnotationResolution
from app.models.project_image import ProjectImage
from app.models.project_member import ProjectMember
from app.schemas.annotation import (
    AnnotationDetail,
    AnnotationResolutionSchema,
    AnnotationSummary,
    AnnotationUpdateRequest,
    CreateAnnotationRequest,
)

router = APIRouter(prefix="/annotations", tags=["annotations"])

# Roles that count toward resolution requirement
_REQUIRED_ROLES = {"architect", "contractor", "homeowner"}


# ── Resolution helpers ────────────────────────────────────────────────────────

async def _get_required_roles(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> set[str]:
    """Distinct roles in project_members for this project, excluding supplier."""
    result = await db.execute(
        select(ProjectMember.role)
        .where(ProjectMember.project_id == project_id)
        .distinct()
    )
    return {row[0] for row in result.fetchall()} & _REQUIRED_ROLES


async def _get_resolutions(
    db: AsyncSession,
    annotation_id: uuid.UUID,
) -> list[AnnotationResolution]:
    result = await db.execute(
        select(AnnotationResolution).where(
            AnnotationResolution.annotation_id == annotation_id,
        )
    )
    return list(result.scalars().all())


def _compute_state(
    resolutions: list[AnnotationResolution],
    required_roles: set[str],
) -> str:
    resolved_roles = {
        r.role for r in resolutions if r.is_resolved
    }
    if not resolved_roles:
        return "OPEN"
    if required_roles.issubset(resolved_roles):
        return "RESOLVED"
    return "PARTIAL"


async def _get_project_id_for_annotation(
    db: AsyncSession,
    ann: Annotation,
) -> uuid.UUID | None:
    result = await db.execute(
        select(ProjectImage.project_id).where(ProjectImage.id == ann.image_id)
    )
    row = result.first()
    return row[0] if row else None


async def _build_summary(
    db: AsyncSession,
    ann: Annotation,
    project_id: uuid.UUID | None = None,
) -> AnnotationSummary:
    resolutions = await _get_resolutions(db, ann.id)
    required_roles: set[str] = set()
    if project_id:
        required_roles = await _get_required_roles(db, project_id)

    return AnnotationSummary(
        id=ann.id,
        image_id=ann.image_id,
        object_id=ann.object_id,
        position_x=ann.position_x,
        position_y=ann.position_y,
        created_by=ann.created_by,
        created_at=ann.created_at,
        resolution_state=_compute_state(resolutions, required_roles),
        required_roles=sorted(required_roles),
        resolutions=[
            AnnotationResolutionSchema(
                id=r.id,
                annotation_id=r.annotation_id,
                user_id=r.user_id,
                role=r.role,
                resolved_at=r.resolved_at,
                unresolved_at=r.unresolved_at,
                is_resolved=r.is_resolved,
            )
            for r in resolutions
        ],
    )


# ── GET /annotations?image_id= ────────────────────────────────────────────────

@router.get("", response_model=list[AnnotationSummary])
async def list_annotations(
    image_id: uuid.UUID = Query(...),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_annotation_project_member),
) -> list[AnnotationSummary]:
    annotations = await list_active_annotations_for_image(
        db, image_id, limit=limit, offset=offset
    )

    # Get project_id once from the image
    project_id: uuid.UUID | None = None
    if annotations:
        img_result = await db.execute(
            select(ProjectImage.project_id).where(ProjectImage.id == image_id)
        )
        row = img_result.first()
        project_id = row[0] if row else None

    return [await _build_summary(db, ann, project_id) for ann in annotations]


# ── POST /annotations ─────────────────────────────────────────────────────────

@router.post("", response_model=AnnotationSummary, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: CreateAnnotationRequest,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
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
    return await _build_summary(db, ann, project_id)


# ── PATCH /annotations/{id}/move ─────────────────────────────────────────────

@router.patch("/{annotation_id}/move", response_model=AnnotationSummary)
async def move_annotation(
    annotation_id: uuid.UUID,
    body: AnnotationUpdateRequest,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
) -> AnnotationSummary:
    ann = await get_active_annotation_in_project(db, annotation_id, project_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    if body.position_x is not None:
        ann.position_x = body.position_x
    if body.position_y is not None:
        ann.position_y = body.position_y
    await db.flush()
    return await _build_summary(db, ann, project_id)


# ── DELETE /annotations/{id} ──────────────────────────────────────────────────

@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: uuid.UUID,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
):
    ann = await soft_delete_annotation_in_project(db, annotation_id, project_id)
    if ann is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annotation not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── POST /annotations/{id}/resolve ────────────────────────────────────────────

@router.post("/{annotation_id}/resolve", response_model=AnnotationSummary)
async def resolve_annotation(
    annotation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_resolver),
) -> AnnotationSummary:
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    project_id = await _get_project_id_for_annotation(db, ann)

    # Verify caller is a member of this project
    if project_id:
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == uuid.UUID(user["user_id"]),
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")

    now = datetime.now(timezone.utc)

    # Upsert — one row per (annotation, user)
    existing_result = await db.execute(
        select(AnnotationResolution).where(
            AnnotationResolution.annotation_id == annotation_id,
            AnnotationResolution.user_id == uuid.UUID(user["user_id"]),
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.resolved_at = now
        existing.unresolved_at = None
    else:
        db.add(AnnotationResolution(
            id=uuid.uuid4(),
            annotation_id=annotation_id,
            user_id=uuid.UUID(user["user_id"]),
            role=user["role"],
            resolved_at=now,
            unresolved_at=None,
        ))

    await db.flush()
    return await _build_summary(db, ann, project_id)


# ── DELETE /annotations/{id}/resolve ─────────────────────────────────────────

@router.delete("/{annotation_id}/resolve", response_model=AnnotationSummary)
async def unresolve_annotation(
    annotation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_resolver),
) -> AnnotationSummary:
    ann = await get_active_annotation(db, annotation_id)
    if ann is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")

    project_id = await _get_project_id_for_annotation(db, ann)

    # Find caller's own resolution row only
    existing_result = await db.execute(
        select(AnnotationResolution).where(
            AnnotationResolution.annotation_id == annotation_id,
            AnnotationResolution.user_id == uuid.UUID(user["user_id"]),
        )
    )
    existing = existing_result.scalar_one_or_none()

    if not existing or not existing.is_resolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have not resolved this annotation",
        )

    existing.unresolved_at = datetime.now(timezone.utc)
    await db.flush()
    return await _build_summary(db, ann, project_id)