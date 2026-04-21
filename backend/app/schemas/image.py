"""app/schemas/image.py — HouseMind"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RefreshedImageUrl(BaseModel):
    image_id: UUID
    url: str
    expires_in: int
    model_config = ConfigDict(from_attributes=True)


class UploadPresignRequest(BaseModel):
    project_id: UUID
    filename: str = Field(max_length=512)
    content_type: str = Field(pattern=r"^image/(jpeg|png|webp|gif)$")


class UploadPresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int = 900


class UploadConfirmRequest(BaseModel):
    project_id: UUID
    s3_key: str
    original_filename: str | None = None
    mime_type: str
    width_px: int | None = None
    height_px: int | None = None


class ProjectImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    s3_key: str
    original_filename: str | None
    mime_type: str
    width_px: int | None
    height_px: int | None
    display_order: int
    created_at: datetime
    url: str | None = None