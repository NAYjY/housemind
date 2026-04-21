"""app/schemas/product.py — HouseMind"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class ProductCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    brand: str | None = None
    model: str | None = None
    price: float | None = None
    currency: str = "THB"
    description: str | None = None
    thumbnail_url: str | None = None
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


class ScrapeImagesResponse(BaseModel):
    images: list[str]
    source_url: str