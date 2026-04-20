"""
app/api/v1/products.py — HouseMind
Product CRUD + search + scrape + object_products linking.
"""
from __future__ import annotations

import uuid
from pathlib import PurePosixPath
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect, require_project_member
from app.db.session import get_db
from app.models.object_product import ObjectProduct
from app.models.product import Product
from app.schemas.annotation import (
    ObjectProductCreate,
    ObjectProductResponse,
    ProductCreateRequest,
    ProductDetail,
    ProductPresignRequest,
    ProductPresignResponse,
    ProductSearchResponse,
    ScrapeImagesResponse,
)
from app.services.s3 import (
    make_product_thumbnail_key,
    presign_product_thumbnail,
    presign_product_thumbnail_upload,
)

router = APIRouter(prefix="/products", tags=["products"])

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
}
_MAX_SCRAPE_IMAGES = 20
_SCRAPE_TIMEOUT = 8.0


def _can_create_product(user: dict) -> bool:
    return user["role"] in {"architect", "supplier"}


def _sign(p: Product) -> ProductDetail:
    try:
        url = presign_product_thumbnail(p.thumbnail_s3_key)
    except RuntimeError:
        url = ""
    return ProductDetail(
        id=p.id,
        name=p.name,
        brand=p.brand,
        model=p.model,
        price=p.price,
        currency=p.currency,
        description=p.description,
        thumbnail_url=url,
        supplier_id=p.supplier_id,
        specs=p.specs,
    )


# ── GET /products/search ──────────────────────────────────────────────────────

@router.get("/search", response_model=ProductSearchResponse)
async def search_products(
    q: str = Query(default="", description="Search term"),
    project_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_member),
) -> ProductSearchResponse:
    """
    Search products by name/brand/model.
    If project_id given, also returns products already in that project first.
    Used by ProductPickerModal.
    """
    stmt = select(Product)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.brand.ilike(like),
                Product.model.ilike(like),
            )
        )
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()

    # count
    from sqlalchemy import func as sqlfunc, select as sel
    count_stmt = sel(sqlfunc.count()).select_from(Product)
    if q:
        count_stmt = count_stmt.where(
            or_(
                Product.name.ilike(f"%{q}%"),
                Product.brand.ilike(f"%{q}%"),
                Product.model.ilike(f"%{q}%"),
            )
        )
    total = (await db.execute(count_stmt)).scalar_one()

    return ProductSearchResponse(
        items=[_sign(p) for p in products],
        total=total,
    )


# ── GET /products/my ──────────────────────────────────────────────────────────

@router.get("/my", response_model=list[ProductDetail])
async def my_products(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> list[ProductDetail]:
    """
    Returns products created by the current user (supplier or architect).
    Used on /products page.
    """
    if not _can_create_product(user):
        return []
    result = await db.execute(
        select(Product).where(Product.supplier_id == uuid.UUID(user["user_id"]))
        .order_by(Product.created_at.desc())
    )
    return [_sign(p) for p in result.scalars().all()]


# ── POST /products/thumbnail-url ──────────────────────────────────────────────

@router.post("/thumbnail-url", response_model=ProductPresignResponse)
async def get_thumbnail_upload_url(
    body: ProductPresignRequest,
    user: dict = Depends(get_current_user),
) -> ProductPresignResponse:
    """Step 1: get presigned S3 PUT URL for product thumbnail."""
    if not _can_create_product(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    ext = PurePosixPath(body.filename).suffix.lstrip(".").lower() or "jpg"
    product_id = uuid.uuid4()
    s3_key = make_product_thumbnail_key(str(product_id), ext)
    try:
        upload_url = presign_product_thumbnail_upload(s3_key, body.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return ProductPresignResponse(upload_url=upload_url, s3_key=s3_key, expires_in=900)


# ── POST /products ─────────────────────────────────────────────────────────────

@router.post("", response_model=ProductDetail, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ProductDetail:
    """
    Architect or supplier creates a product.
    thumbnail_s3_key: either S3 key from upload flow OR direct URL.
    """
    if not _can_create_product(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # thumbnail: direct URL or S3 key
    thumbnail_s3_key = body.thumbnail_url or ""

    product = Product(
        id=uuid.uuid4(),
        supplier_id=uuid.UUID(user["user_id"]),
        name=body.name,
        brand=body.brand,
        model=body.model,
        price=body.price,
        currency=body.currency,
        description=body.description,
        thumbnail_s3_key=thumbnail_s3_key,
        specs=body.specs,
    )
    db.add(product)
    await db.flush()
    return _sign(product)


# ── GET /products/{product_id} ────────────────────────────────────────────────

@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> ProductDetail:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _sign(product)


# ── GET /products?project_id= ─────────────────────────────────────────────────

@router.get("", response_model=list[ProductDetail])
async def list_project_products(
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> list[ProductDetail]:
    """All products linked to a project via object_products."""
    result = await db.execute(
        select(Product)
        .join(ObjectProduct, ObjectProduct.product_id == Product.id)
        .where(ObjectProduct.project_id == project_id)
        .order_by(ObjectProduct.created_at.desc())
    )
    return [_sign(p) for p in result.scalars().all()]


# ── POST /products/link ───────────────────────────────────────────────────────

@router.post("/link", response_model=ObjectProductResponse, status_code=status.HTTP_201_CREATED)
async def link_product_to_project(
    body: ObjectProductCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_member),
) -> ObjectProductResponse:
    """Link a product to a project (attach to project's product pool)."""
    # check not already linked
    existing = await db.execute(
        select(ObjectProduct).where(
            ObjectProduct.project_id == body.project_id,
            ObjectProduct.product_id == body.product_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already linked")

    op = ObjectProduct(
        id=uuid.uuid4(),
        project_id=body.project_id,
        product_id=body.product_id,
    )
    db.add(op)
    await db.flush()

    prod_result = await db.execute(select(Product).where(Product.id == body.product_id))
    prod = prod_result.scalar_one_or_none()

    return ObjectProductResponse(
        id=op.id,
        project_id=op.project_id,
        product_id=op.product_id,
        created_at=op.created_at,
        product=_sign(prod) if prod else None,
    )


# ── DELETE /products/link/{object_product_id} ─────────────────────────────────

@router.delete("/link/{object_product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_product_from_project(
    object_product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_member),
):
    result = await db.execute(
        select(ObjectProduct).where(ObjectProduct.id == object_product_id)
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await db.delete(op)
    await db.flush()
    from fastapi import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── GET /products/scrape-images ───────────────────────────────────────────────

@router.get("/scrape-images", response_model=ScrapeImagesResponse)
async def scrape_product_images(
    url: str = Query(...),
    _user: dict = Depends(require_architect),
) -> ScrapeImagesResponse:
    try:
        async with httpx.AsyncClient(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    content_type = resp.headers.get("content-type", "")
    if content_type.startswith("image/"):
        return ScrapeImagesResponse(images=[url], source_url=url)

    soup = BeautifulSoup(resp.text, "html.parser")
    imgs: list[str] = []
    for tag in soup.find_all("img"):
        src = tag.get("src")
        if src:
            imgs.append(urljoin(url, src))
        if len(imgs) >= _MAX_SCRAPE_IMAGES:
            break
    if not imgs:
        for tag in soup.find_all("meta"):
            prop = tag.get("property") or tag.get("name", "")
            if prop in ("og:image", "twitter:image"):
                content = tag.get("content")
                if content:
                    imgs.append(urljoin(url, content))
    if not imgs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No images found")
    return ScrapeImagesResponse(images=imgs[:_MAX_SCRAPE_IMAGES], source_url=url)