"""
app/schemas/project.py — HouseMind
Pydantic v2 schemas for project and sub-project endpoints.

New in merge: project CRUD was absent from HouseMind; ported from figmaTem pattern.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreateRequest(BaseModel):
    """Body for POST /api/v1/projects (top-level) and POST /api/v1/projects/{id}/sub"""
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectListItem(BaseModel):
    """Lightweight project row for list views (carousel header, sidebar)."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    status: str
    parent_project_id: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectDetail(BaseModel):
    """Full project detail, including nested subprojects list."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    architect_id: UUID
    parent_project_id: UUID | None
    name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    subprojects: list[ProjectListItem] = []