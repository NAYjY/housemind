"""
app/api/v1/projects.py — HouseMind

SEC-04 fix: when an architect creates a project (top-level or sub-project),
they are automatically added to project_members.  Without this, the architect
would fail their own require_project_member check on subsequent reads.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect, require_project_owner
from app.db.session import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember  # SEC-04
from app.schemas.project import ProjectCreateRequest, ProjectDetail, ProjectListItem

router = APIRouter(prefix="/projects", tags=["projects"])


async def _add_architect_as_member(
    db: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """SEC-04: ensure the architect is in project_members for their own project."""
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=project_id,
        user_id=user_id,
        role="architect",
    )
    db.add(member)



# ── GET /projects ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProjectListItem])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> list[ProjectListItem]:
    if user["role"] != "architect":
        return []
    result = await db.execute(
        select(Project).where(
            Project.architect_id == uuid.UUID(user["user_id"]),
            Project.parent_project_id.is_(None),
            Project.status != "archived",
        ).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


# ── GET /projects/{project_id} ────────────────────────────────────────────────

@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
) -> ProjectDetail:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    sub_result = await db.execute(
        select(Project).where(
            Project.parent_project_id == project_id,
            Project.status != "archived",
        ).order_by(Project.created_at)
    )
    subprojects = list(sub_result.scalars().all())

    return ProjectDetail(
        id=project.id,
        architect_id=project.architect_id,
        parent_project_id=project.parent_project_id,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        updated_at=project.updated_at,
        subprojects=[
            ProjectListItem(
                id=s.id,
                name=s.name,
                status=s.status,
                parent_project_id=s.parent_project_id,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in subprojects
        ],
    )


# ── POST /projects ─────────────────────────────────────────────────────────────

@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect),
) -> ProjectDetail:
    project = Project(
        id=uuid.uuid4(),
        architect_id=uuid.UUID(user["user_id"]),
        parent_project_id=None,
        name=body.name,
        description=body.description,
        status="draft",
    )
    db.add(project)
    await db.flush()

    # SEC-04: architect must be a member of their own project
    await _add_architect_as_member(db, project.id, uuid.UUID(user["user_id"]))
    await db.flush()

    return ProjectDetail(
        id=project.id,
        architect_id=project.architect_id,
        parent_project_id=None,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        updated_at=project.updated_at,
        subprojects=[],
    )


# ── POST /projects/{project_id}/sub ───────────────────────────────────────────

@router.post("/{project_id}/sub", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_subproject(
    project_id: uuid.UUID,
    body: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> ProjectDetail:
    sub = Project(
        id=uuid.uuid4(),
        architect_id=uuid.UUID(user["user_id"]),
        parent_project_id=project_id,
        name=body.name,
        description=body.description,
        status="draft",
    )
    db.add(sub)
    await db.flush()

    # SEC-04: architect added to sub-project members too
    await _add_architect_as_member(db, sub.id, uuid.UUID(user["user_id"]))
    await db.flush()

    return ProjectDetail(
        id=sub.id,
        architect_id=sub.architect_id,
        parent_project_id=sub.parent_project_id,
        name=sub.name,
        description=sub.description,
        status=sub.status,
        created_at=sub.created_at,
        updated_at=sub.updated_at,
        subprojects=[],
    )


# ── PATCH /projects/{project_id}/archive ──────────────────────────────────────

@router.patch("/{project_id}/archive", response_model=ProjectListItem)
async def archive_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> ProjectListItem:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.architect_id == uuid.UUID(user["user_id"]),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.is_archived:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project already archived")

    project.status = "archived"

    sub_result = await db.execute(
        select(Project).where(Project.parent_project_id == project_id)
    )
    for sub in sub_result.scalars().all():
        sub.status = "archived"

    await db.flush()
    return ProjectListItem(
        id=project.id,
        name=project.name,
        status=project.status,
        parent_project_id=project.parent_project_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
    
# ── DELETE /projects/{project_id} ─────────────────────────────────────────────

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_architect),
) -> Response:
    """
    Delete a subproject (and cascade its images + annotations via DB CASCADE).
    Only the architect who owns it can delete it.
    Only subprojects (parent_project_id IS NOT NULL) can be deleted this way.
    """
    from fastapi import Response as FastAPIResponse
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.architect_id == uuid.UUID(user["user_id"]),
            Project.parent_project_id.is_not(None),  # only subprojects
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subproject not found or you don't own it",
        )
    await db.delete(project)
    await db.flush()
    return FastAPIResponse(status_code=status.HTTP_204_NO_CONTENT)