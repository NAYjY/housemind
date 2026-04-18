"""
app/schemas/annotation.py — HouseMind
Pydantic v2 request/response schemas.

Changes vs original:
  - Added AnnotationUpdateRequest: move pin position + optionally link a product.
    Merges figmaTem's POST /annotations/move/<id> {x, y} into a single PATCH.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Annotation schemas ────────────────────────────────────────────────────────

class AnnotationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_id: UUID
    linked_product_id: UUID | None
    thumbnail_url: str
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    created_by: UUID | None
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: UUID | None = None


class CreateAnnotationRequest(BaseModel):
    """Body for POST /api/v1/annotations"""
    image_id: UUID
    linked_product_id: UUID | None = None
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    label: str | None = Field(default=None, max_length=512)
    note: str | None = None


class AnnotationUpdateRequest(BaseModel):
    """
    Body for PATCH /api/v1/annotations/{id}/move
    Merges figmaTem's move endpoint into HouseMind coordinate system.
    position_x / position_y are normalised [0.0, 1.0] — NOT pixels.
    linked_product_id can be updated in the same call (null = unlink product).
    All fields optional so client can send only what changed.
    """
    position_x: float | None = Field(default=None, ge=0.0, le=1.0)
    position_y: float | None = Field(default=None, ge=0.0, le=1.0)
    linked_product_id: UUID | None = None
    # Sentinel: if True, explicitly unlinks the product even if linked_product_id
    # is omitted. Avoids ambiguity between "not sending" vs "intentionally null".
    unlink_product: bool = False


class AnnotationDetail(AnnotationSummary):
    """Full annotation payload — returned on single-annotation fetch."""
    label: str | None = None
    note: str | None = None
    updated_at: datetime


class ResolveAnnotationRequest(BaseModel):
    """Body for PATCH /api/v1/annotations/{id}/resolve"""
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


# ── Scraper schema ────────────────────────────────────────────────────────────

class ScrapeImagesResponse(BaseModel):
    """Response for GET /api/v1/products/scrape-images"""
    images: list[str]
    source_url: str


# ── Image URL refresh schema ──────────────────────────────────────────────────

class RefreshedImageUrl(BaseModel):
    image_id: UUID
    url: str
    expires_in: int
    model_config = ConfigDict(from_attributes=True)


# ── Upload schemas ────────────────────────────────────────────────────────────

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
    # Pre-signed URL is added in the endpoint layer, not on the model
    url: str | None = None