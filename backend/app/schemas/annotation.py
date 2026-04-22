"""
app/schemas/annotation.py — HouseMind

SEC-19 fix: object_id is now validated against the known set {0} | {101..108}.
  Previously Field(ge=0, le=200) accepted any integer in 0-200, giving 192
  undocumented values with no corresponding emoji definition and no UI path
  to create them — pure unvalidated attack surface.

  0   = unknown/legacy (backfill default from migration 005)
  101-108 = the 8 emoji categories defined in FanEmojiMenu.tsx
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_VALID_OBJECT_IDS = frozenset({0, 101, 102, 103, 104, 105, 106, 107, 108})


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
    # SEC-19: whitelist instead of open range
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
                f"object_id must be 0 (legacy) or one of {sorted(_VALID_OBJECT_IDS - {0})}"
            )
        return v


class AnnotationUpdateRequest(BaseModel):
    position_x: float | None = Field(default=None, ge=0.0, le=1.0)
    position_y: float | None = Field(default=None, ge=0.0, le=1.0)


class AnnotationDetail(AnnotationSummary):
    label: str | None = None
    note: str | None = None
    updated_at: datetime


class ResolveAnnotationRequest(BaseModel):
    note: str | None = Field(default=None, max_length=4096)
