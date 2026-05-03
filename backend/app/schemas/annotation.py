"""
app/schemas/annotation.py — HouseMind
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_VALID_OBJECT_IDS = frozenset({0, 101, 102, 103, 104, 105, 106, 107, 108})

ResolutionState = Literal["OPEN", "PARTIAL", "RESOLVED"]


class AnnotationResolutionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    annotation_id: UUID
    user_id: UUID | None
    role: str
    resolved_at: datetime
    unresolved_at: datetime | None = None
    is_resolved: bool


class AnnotationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_id: UUID
    object_id: int
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    created_by: UUID | None
    created_at: datetime

    # Resolution
    resolution_state: ResolutionState = "OPEN"
    required_roles: list[str] = []
    resolutions: list[AnnotationResolutionSchema] = []


class CreateAnnotationRequest(BaseModel):
    image_id: UUID
    object_id: int = Field(ge=0, le=200)
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    label: str | None = Field(default=None, max_length=512)
    note: str | None = Field(default=None, max_length=4096)

    @field_validator("object_id")
    @classmethod
    def validate_object_id(cls, v: int) -> int:
        if v not in _VALID_OBJECT_IDS:
            raise ValueError(
                f"object_id must be 0 or one of {sorted(_VALID_OBJECT_IDS - {0})}"
            )
        return v


class AnnotationUpdateRequest(BaseModel):
    position_x: float | None = Field(default=None, ge=0.0, le=1.0)
    position_y: float | None = Field(default=None, ge=0.0, le=1.0)


class AnnotationDetail(AnnotationSummary):
    label: str | None = None
    note: str | None = None
    updated_at: datetime