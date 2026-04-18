"""
app/api/v1/projects.py — HouseMind
Project CRUD + sub-project tree endpoints.

New in merge: figmaTem had project list, detail, create (top-level + sub) via Flask.
These are now proper role-gated FastAPI endpoints.

URL contract:
  GET  /api/v1/projects                        → list user's top-level projects
  GET  /api/v1/projects/{project_id}           → project detail + subprojects
  POST /api/v1/projects                        → create top-level project (architect)
  POST /api/v1/projects/{project_id}/sub       → create subproject (architect, owner)
  PATCH /api/v1/projects/{project_id}/archive  → archive project (architect, owner)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect, require_project_owner
from app.db.session import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreateRequest, ProjectDetail, ProjectListItem

router = APIRouter(prefix="/projects", tags=["projects"])


# ── GET /projects ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProjectListItem])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> list[ProjectListItem]:
    """
    List top-level projects owned by the current architect.
    Mirrors figmaTem GET /projects/user/<auth_id> but derives auth_id from JWT.
    Non-architect roles receive an empty list (phase 2: add invite join).
    """
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
    """
    Full project detail including subprojects list.
    Mirrors figmaTem GET /projects/<project_id>.
    Any authenticated user can read (homeowners, contractors, suppliers need to view).
    """
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Load subprojects (one extra query; acceptable — tree depth is shallow)
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
    """
    Create a top-level project.
    Mirrors figmaTem POST /projects/maincreate but requires JWT (not plain auth_id).
    """
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
    """
    Create a subproject under an existing project.
    Mirrors figmaTem POST /projects/create_sub.
    Parent project must be owned by the requesting architect and not archived.
    """
    # Parent existence already validated by require_project_owner
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
    """
    Soft-archive a project (status = 'archived').
    Hard DELETE is never used on projects.
    Cascades: subprojects are also archived in a single UPDATE.
    """
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

    # Cascade archive to subprojects
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