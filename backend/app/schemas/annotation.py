"""
app/schemas/annotation.py — HouseMind
"""
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


# ── Product schemas ───────────────────────────────────────────────────────────

class ProductDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    brand: str | None = None
    model: str | None = None
    price: float | None = None
    currency: str = "THB"
    description: str | None = None
    thumbnail_url: str
    supplier_id: UUID | None = None
    specs: dict | None = None


# ── Object product schemas ────────────────────────────────────────────────────

class ObjectProductCreate(BaseModel):
    project_id: UUID
    object_id: int = Field(ge=0, le=200)
    product_id: UUID


class ObjectProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    object_id: int
    product_id: UUID
    created_at: datetime
    product: ProductDetail | None = None


# ── Scraper schema ────────────────────────────────────────────────────────────

class ScrapeImagesResponse(BaseModel):
    images: list[str]
    source_url: str


# ── Image URL schemas ─────────────────────────────────────────────────────────

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


# ── Product create/update schemas ─────────────────────────────────────────────

class ProductCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    brand: str | None = None
    model: str | None = None
    price: float | None = None
    currency: str = "THB"
    description: str | None = None
    thumbnail_url: str | None = None   # direct URL option
    specs: dict | None = None


class ProductPresignRequest(BaseModel):
    filename: str = Field(max_length=512)
    content_type: str = Field(pattern=r"^image/(jpeg|png|webp|gif)$")


class ProductPresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int = 900


class ProductSearchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: list[ProductDetail]
    total: int