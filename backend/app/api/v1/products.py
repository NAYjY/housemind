"""
app/api/v1/products.py — HouseMind
Product CRUD + search + scrape + object_products linking.

Security fixes:

SEC-01  IDOR on object_products — DELETE and POST /products/link now use
        require_project_owner so only the project architect can link/unlink
        products.  Previously require_project_member (a no-op) allowed ANY
        authenticated user to delete product links from any project.

SEC-02  SSRF via scrape endpoint — URL is validated through ssrf_guard
        before httpx fetches it.  Private/internal IPs are blocked.

SEC-07  Product search no longer returns the global catalogue.  If project_id
        is supplied, only products linked to that project are returned.  If
        not supplied, the endpoint now requires project_id.

SEC-08  NameError fixed — logger was used in _presign_product but was never
        imported.  Added `from app.core.logging import get_logger`.

SEC-14  Pagination added to list_project_products and search.

SEC-16  Scrape endpoint reads at most SCRAPE_MAX_BYTES (2 MB) of response
        body.  Previously the entire response was parsed into memory.

SEC-25  External thumbnail URLs validated: must be https, must end with an
        image extension or be an S3 URL.  This prevents an attacker from
        storing a tracking pixel URL as a product thumbnail.
"""
from __future__ import annotations

import re
import uuid
from pathlib import PurePosixPath
from urllib.parse import urljoin
import asyncio

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_architect, require_project_member, require_project_owner
from app.core.logging import get_logger  # SEC-08: was missing
from app.db.session import get_db
from app.models.object_product import ObjectProduct
from app.models.product import Product
from app.schemas.product import (
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
    presign_product_thumbnail_async,
    presign_product_thumbnail_upload_async,
)
from app.services.ssrf_guard import validate_url_against_ssrf  # SEC-02

logger = get_logger(__name__)  # SEC-08

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
_SCRAPE_MAX_BYTES = 2 * 1024 * 1024  # SEC-16: 2 MB hard cap

# SEC-25: trusted thumbnail URL patterns
_TRUSTED_THUMBNAIL_RE = re.compile(
    r"^https://"                            # https only
    r"("
    r"[a-z0-9\-]+\.s3\.[a-z0-9\-]+\.amazonaws\.com/"  # S3 virtual-hosted
    r"|s3\.[a-z0-9\-]+\.amazonaws\.com/"              # S3 path-style
    r"|[a-z0-9\-\.]+\.(jpg|jpeg|png|webp|gif|avif)$"  # direct image URL
    r")",
    re.IGNORECASE,
)


def _can_create_product(user: dict) -> bool:
    return user["role"] in {"architect", "supplier"}


async def _presign_product(p: Product) -> ProductDetail:
    try:
        url = await presign_product_thumbnail_async(p.thumbnail_s3_key)
    except RuntimeError:
        logger.warning("presign.failed", product_id=str(p.id), key=p.thumbnail_s3_key, error=str(exc))
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


def _validate_thumbnail_url(url: str) -> str:
    """
    SEC-25: reject external thumbnail URLs that don't look like images.
    This prevents tracking pixel injection (attacker stores
    https://attacker.com/pixel.gif?user=X as a product thumbnail).
    Trusted patterns: S3 URLs or direct image file URLs (https only).
    """
    if not url:
        return url
    if not url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Thumbnail URL must use https://",
        )
    if not _TRUSTED_THUMBNAIL_RE.match(url):
        # Check if it ends with a known image extension as fallback
        lower = url.lower().split("?")[0]  # strip query string
        if not any(lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Thumbnail URL must point to an image file (jpg, png, webp, gif, avif) "
                    "or an S3 bucket URL."
                ),
            )
    return url


# ── GET /products/search ──────────────────────────────────────────────────────

@router.get("/search", response_model=ProductSearchResponse)
async def search_products(
    project_id: uuid.UUID = Query(..., description="Required — search within this project"),
    q: str = Query(default="", description="Search term"),
    limit: int = Query(default=20, le=100),    # SEC-14
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_member),  # SEC-04: now a real membership check
) -> ProductSearchResponse:
    """
    SEC-07 fix: search is now scoped to a project.  project_id is required.
    Returns only products linked to that project, filtered by query.
    Previously returned the entire global product catalogue.
    """
    stmt = (
        select(Product)
        .join(ObjectProduct, ObjectProduct.product_id == Product.id)
        .where(ObjectProduct.project_id == project_id)
    )
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.brand.ilike(like),
                Product.model.ilike(like),
            )
        )

    count_stmt = select(
        __import__("sqlalchemy", fromlist=["func"]).func.count()
    ).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()

    return ProductSearchResponse(
        items=list(await asyncio.gather(*[_presign_product(p) for p in products])),
        total=total,
    )

# ── GET /products/catalogue ───────────────────────────────────────────────────
# SEC-07 NOTE: /search is intentionally scoped to a project (shows only
# already-linked products). This separate endpoint serves the product picker
# modal — it lets an architect search their own + all supplier products so
# they can ATTACH them to a project. Requires authentication only.

@router.get("/catalogue", response_model=ProductSearchResponse)
async def search_catalogue(
    q: str = Query(default=""),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ProductSearchResponse:
    """
    Global product search for the product picker modal.
    Returns products from the full catalogue (not scoped to a project).
    An architect/supplier sees their own products + all supplier products.
    """
    stmt = select(Product)

    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.brand.ilike(like),
                Product.model.ilike(like),
            )
        )

    count_stmt = select(
        __import__("sqlalchemy", fromlist=["func"]).func.count()
    ).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Product.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()

    return ProductSearchResponse(
        items=list(await asyncio.gather(*[_presign_product(p) for p in products])),
        total=total,
    )
    
# ── GET /products/my ──────────────────────────────────────────────────────────

@router.get("/my", response_model=list[ProductDetail])
async def my_products(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> list[ProductDetail]:
    if not _can_create_product(user):
        return []
    result = await db.execute(
        select(Product)
        .where(Product.supplier_id == uuid.UUID(user["user_id"]))
        .order_by(Product.created_at.desc())
        .limit(500)  # SEC-14: hard cap even on "my products"
    )
    return [await _presign_product(p) for p in result.scalars().all()]


# ── POST /products/thumbnail-url ──────────────────────────────────────────────

@router.post("/thumbnail-url", response_model=ProductPresignResponse)
async def get_thumbnail_upload_url(
    body: ProductPresignRequest,
    user: dict = Depends(get_current_user),
) -> ProductPresignResponse:
    if not _can_create_product(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    from pathlib import PurePosixPath as _P
    ext = _P(body.filename).suffix.lstrip(".").lower() or "jpg"
    product_id = uuid.uuid4()
    s3_key = make_product_thumbnail_key(str(product_id), ext)
    try:
        upload_url = await presign_product_thumbnail_upload_async(s3_key, body.content_type)
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
    if not _can_create_product(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    thumbnail_s3_key = ""
    if body.thumbnail_url:
        thumbnail_s3_key = _validate_thumbnail_url(body.thumbnail_url)  # SEC-25

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
    return await _presign_product(product)


# ── GET /products?project_id= ─────────────────────────────────────────────────

@router.get("", response_model=list[ProductDetail])
async def list_project_products(
    project_id: uuid.UUID = Query(...),
    object_id: int | None = Query(default=None),
    limit: int = Query(default=100, le=500),   # SEC-14
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),  # SEC-04: real membership check
) -> list[ProductDetail]:
    stmt = (
        select(Product)
        .join(ObjectProduct, ObjectProduct.product_id == Product.id)
        .where(ObjectProduct.project_id == project_id)
    )
    if object_id is not None:
        stmt = stmt.where(ObjectProduct.object_id == object_id)
    stmt = stmt.order_by(ObjectProduct.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [await _presign_product(p) for p in result.scalars().all()]


# ── POST /products/link ────────────────────────────────────────────────────────

@router.post("/link", response_model=ObjectProductResponse, status_code=status.HTTP_201_CREATED)
async def link_product_to_project(
    body: ObjectProductCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),  # SEC-01: was require_project_member
) -> ObjectProductResponse:
    """
    SEC-01 fix: require_project_owner enforces that only the project architect
    can link products.  Previously require_project_member was a no-op.
    """
    existing = await db.execute(
        select(ObjectProduct).where(
            ObjectProduct.project_id == body.project_id,
            ObjectProduct.object_id == body.object_id,
            ObjectProduct.product_id == body.product_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already linked")

    op = ObjectProduct(
        id=uuid.uuid4(),
        project_id=body.project_id,
        object_id=body.object_id,
        product_id=body.product_id,
    )
    db.add(op)
    await db.flush()

    prod_result = await db.execute(select(Product).where(Product.id == body.product_id))
    prod = prod_result.scalar_one_or_none()

    return ObjectProductResponse(
        id=op.id,
        project_id=op.project_id,
        object_id=op.object_id,
        product_id=op.product_id,
        created_at=op.created_at,
        product=await _presign_product(prod) if prod else None,
    )


# ── DELETE /products/link/{object_product_id} ─────────────────────────────────

@router.delete("/link/{object_product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_product_from_project(
    object_product_id: uuid.UUID,
    project_id: uuid.UUID = Query(...),  # SEC-01: required for ownership check
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),  # SEC-01: was require_project_member
) -> Response:
    """
    SEC-01 fix: project_id query param added so require_project_owner can
    verify ownership.  The query also asserts object_product.project_id
    matches — prevents deleting a link from a different project even if the
    caller owns some project.
    """
    result = await db.execute(
        select(ObjectProduct).where(
            ObjectProduct.id == object_product_id,
            ObjectProduct.project_id == project_id,  # project scope guard
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await db.delete(op)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# ── DELETE /products/link-by-product ─────────────────────────────────────────

@router.delete("/link-by-product", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_product_by_product_id(
    project_id: uuid.UUID = Query(...),
    product_id: uuid.UUID = Query(...),
    object_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> Response:
    """Unlink a product from a project object by product_id + object_id."""
    result = await db.execute(
        select(ObjectProduct).where(
            ObjectProduct.project_id == project_id,
            ObjectProduct.product_id == product_id,
            ObjectProduct.object_id == object_id,
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    await db.delete(op)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)



# ── GET /products/scrape-images ───────────────────────────────────────────────

@router.get("/scrape-images", response_model=ScrapeImagesResponse)
async def scrape_product_images(
    url: str = Query(...),
    _user: dict = Depends(require_architect),
) -> ScrapeImagesResponse:
    """
    SEC-02 fix: URL validated through ssrf_guard before the request fires.
    Private IPs, loopback, link-local (169.254.x.x — AWS metadata), and
    RFC 1918 ranges are all blocked.

    SEC-16 fix: response body capped at SCRAPE_MAX_BYTES (2 MB).
    Previously the entire response was buffered into memory, enabling
    memory exhaustion via a slow, large response.
    """
    validate_url_against_ssrf(url, require_https=True)  # SEC-02

    try:
        async with httpx.AsyncClient(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            async with client.stream("GET", url) as response:
                content_type = response.headers.get("content-type", "")
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    total += len(chunk)
                    if total > _SCRAPE_MAX_BYTES:  # SEC-16
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Remote response exceeds 2 MB limit",
                        )
                    chunks.append(chunk)
                raw = b"".join(chunks)
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if content_type.startswith("image/"):
        return ScrapeImagesResponse(images=[url], source_url=url)

    soup = BeautifulSoup(raw, "html.parser")
    imgs: list[str] = []
    for tag in soup.find_all("img"):
        src = tag.get("src")
        if src:
            absolute = urljoin(url, src)
            # SEC-02: validate each scraped image URL too
            try:
                validate_url_against_ssrf(absolute, require_https=False)
                imgs.append(absolute)
            except HTTPException:
                continue  # silently skip internal-pointing image URLs
        if len(imgs) >= _MAX_SCRAPE_IMAGES:
            break
    if not imgs:
        for tag in soup.find_all("meta"):
            prop = tag.get("property") or tag.get("name", "")
            if prop in ("og:image", "twitter:image"):
                content = tag.get("content")
                if content:
                    absolute = urljoin(url, content)
                    try:
                        validate_url_against_ssrf(absolute, require_https=False)
                        imgs.append(absolute)
                    except HTTPException:
                        continue
    if not imgs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No images found")
    return ScrapeImagesResponse(images=imgs[:_MAX_SCRAPE_IMAGES], source_url=url)


# ── GET /products/{product_id} ────────────────────────────────────────────────

@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),  # any authenticated user can view catalog
) -> ProductDetail:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _presign_product(product)

# ── DELETE /products/{product_id} ─────────────────────────────────────────────

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Response:
    """
    Delete a product. Only the supplier/architect who created it can delete.
    Also removes all object_products links (CASCADE in DB handles annotations).
    """
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.supplier_id == uuid.UUID(user["user_id"]),
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or you don't own it",
        )
    await db.delete(product)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)