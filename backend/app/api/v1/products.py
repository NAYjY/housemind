"""
app/api/v1/products.py — HouseMind
Product detail endpoint — called only on annotation pin tap (lazy load).

URL contract (matches Frontend after BLK-2 fix):
  GET /api/v1/products/{product_id}   → full product detail with pre-signed thumbnail
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_project_member
from app.db.session import get_db
from app.models.product import Product
from app.schemas.annotation import ProductDetail
from app.services.s3 import presign_product_thumbnail

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> ProductDetail:
    """
    Full product detail — called ONLY when user taps an annotation pin.
    thumbnail_url is pre-signed (valid 1 hour) before return.
    Frontend caches this in Zustand store; subsequent taps on same pin skip this call.
    """
    result = await db.execute(
        select(Product).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    try:
        thumbnail_url = presign_product_thumbnail(product.thumbnail_s3_key)
    except RuntimeError:
        # Non-fatal: return empty URL, frontend shows placeholder
        thumbnail_url = ""

    return ProductDetail(
        id=product.id,
        name=product.name,
        brand=product.brand,
        model=product.model,
        price=product.price,
        currency=product.currency,
        description=product.description,
        thumbnail_url=thumbnail_url,
        supplier_id=product.supplier_id,
        specs=product.specs,
    )
