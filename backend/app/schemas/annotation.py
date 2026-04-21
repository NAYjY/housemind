"""app/schemas/annotation.py — HouseMind"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnnotationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_id: UUID
    object_id: int
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    created_by: UUID | None
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: UUID | None = None


class CreateAnnotationRequest(BaseModel):
    image_id: UUID
    object_id: int = Field(ge=0, le=200)
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    label: str | None = Field(default=None, max_length=512)
    note: str | None = None


class AnnotationUpdateRequest(BaseModel):
    position_x: float | None = Field(default=None, ge=0.0, le=1.0)
    position_y: float | None = Field(default=None, ge=0.0, le=1.0)


class AnnotationDetail(AnnotationSummary):
    label: str | None = None
    note: str | None = None
    updated_at: datetime


class ResolveAnnotationRequest(BaseModel):
    note: str | None = None