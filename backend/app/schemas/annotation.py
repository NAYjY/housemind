"""
app/schemas/annotation.py — HouseMind
Pydantic v2 request/response schemas.

Alignment fixes vs Backend agent draft:
  - AnnotationSummary.annotation_id → id          (DB PK column is `id`)
  - AnnotationSummary.product_id → linked_product_id  (DB FK column name)
  - ProductDetail.product_id → id                 (DB PK column is `id`)
  - ProductDetail.metadata → specs                (DB column name)
  - Added CreateAnnotationRequest schema           (was missing)
  - Added ResolveAnnotationRequest schema          (was missing — needed for resolve/reopen)
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Annotation schemas ────────────────────────────────────────────────────────

class AnnotationSummary(BaseModel):
    """
    Lightweight payload returned for the annotation list endpoint.
    Omits note/label text to keep initial page load small.
    thumbnail_url is pre-signed before this is returned.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID                        # DB column: annotations.id
    image_id: UUID
    linked_product_id: UUID | None  # DB column: annotations.linked_product_id
    thumbnail_url: str              # pre-signed S3 URL, signed at response time
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    created_by: UUID | None
    created_at: datetime
    # Resolve state
    resolved_at: datetime | None = None
    resolved_by: UUID | None = None


class CreateAnnotationRequest(BaseModel):
    """Body for POST /api/v1/annotations"""
    image_id: UUID
    linked_product_id: UUID | None = None  # nullable — product may be assigned later
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    label: str | None = Field(default=None, max_length=512)
    note: str | None = None


class AnnotationDetail(AnnotationSummary):
    """Full annotation payload — returned on single-annotation fetch."""
    label: str | None = None
    note: str | None = None
    updated_at: datetime


class ResolveAnnotationRequest(BaseModel):
    """
    Body for PATCH /api/v1/annotations/{id}/resolve
    No fields required — resolution is a state toggle, not a data update.
    Optional note can be provided as the resolve comment.
    """
    note: str | None = None


# ── Product schemas ───────────────────────────────────────────────────────────

class ProductDetail(BaseModel):
    """
    Full product detail — returned only on annotation tap (lazy load).
    thumbnail_url is pre-signed before return.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID                        # DB column: products.id
    name: str
    brand: str | None = None
    model: str | None = None
    price: float | None = None
    currency: str = "THB"
    description: str | None = None
    thumbnail_url: str              # pre-signed, not raw S3 key
    supplier_id: UUID | None = None
    specs: dict | None = None       # DB column: products.specs (JSONB)


# ── Image URL refresh schema ──────────────────────────────────────────────────

class RefreshedImageUrl(BaseModel):
    """Response for GET /api/v1/images/{id}/url"""
    image_id: UUID
    url: str
    expires_in: int  # seconds — lets frontend set React Query staleTime

    model_config = ConfigDict(from_attributes=True)


# ── Upload schemas ────────────────────────────────────────────────────────────

class UploadPresignRequest(BaseModel):
    """Body for POST /api/v1/images/upload-url"""
    project_id: UUID
    filename: str = Field(max_length=512)
    content_type: str = Field(pattern=r"^image/(jpeg|png|webp|gif)$")


class UploadPresignResponse(BaseModel):
    """
    Returns a presigned PUT URL for direct S3 upload.
    Client uploads file directly to S3, then calls POST /api/v1/images/confirm.
    The ProjectImage DB record is created ONLY after confirm is called.
    """
    upload_url: str     # presigned PUT URL, valid for 15 minutes
    s3_key: str         # key to pass back in confirm request
    expires_in: int = 900


class UploadConfirmRequest(BaseModel):
    """Body for POST /api/v1/images/confirm — called after successful S3 upload"""
    project_id: UUID
    s3_key: str
    original_filename: str | None = None
    mime_type: str
    width_px: int | None = None
    height_px: int | None = None


class ProjectImageResponse(BaseModel):
    """Response after image upload is confirmed"""
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
