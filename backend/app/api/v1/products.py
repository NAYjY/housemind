"""
app/api/v1/products.py — HouseMind
Product detail endpoint + project product list + URL image scraper.

Changes vs original:
  - Added GET /products?project_id=<uuid>   → list products used in a project.
    Merges figmaTem GET /products/get/<project_id>.
  - Added GET /products/scrape-images?url=  → async image scraper.
    Merges figmaTem GET /products/get-images?url= (BeautifulSoup).
    Async httpx replaces sync requests; architect-only role gate prevents open proxy.

URL contract:
  GET /api/v1/products?project_id=<uuid>          → project product list (all roles)
  GET /api/v1/products/scrape-images?url=<url>    → scrape images from URL (architect)
  GET /api/v1/products/{product_id}               → full product detail on tap (all roles)
"""
from __future__ import annotations

import uuid
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_architect, require_project_member
from app.db.queries import list_active_annotations_for_project
from app.db.session import get_db
from app.models.product import Product
from app.schemas.annotation import ProductDetail, ScrapeImagesResponse
from app.services.s3 import presign_product_thumbnail

router = APIRouter(prefix="/products", tags=["products"])

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
}
_MAX_SCRAPE_IMAGES = 20
_SCRAPE_TIMEOUT = 8.0


# ── GET /products?project_id=<uuid> ──────────────────────────────────────────

@router.get("", response_model=list[ProductDetail])
async def list_project_products(
    project_id: uuid.UUID = Query(..., description="Project ID to list products for"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> list[ProductDetail]:
    """
    All products linked to annotations in a project.
    Uses list_active_annotations_for_project join — no N+1.
    Merges figmaTem GET /products/get/<project_id>.
    """
    annotations = await list_active_annotations_for_project(db, project_id)
    product_ids = list({a.linked_product_id for a in annotations if a.linked_product_id})

    if not product_ids:
        return []

    result = await db.execute(
        select(Product).where(Product.id.in_(product_ids))
    )
    products = result.scalars().all()

    out = []
    for p in products:
        try:
            thumbnail_url = presign_product_thumbnail(p.thumbnail_s3_key)
        except RuntimeError:
            thumbnail_url = ""
        out.append(
            ProductDetail(
                id=p.id,
                name=p.name,
                brand=p.brand,
                model=p.model,
                price=p.price,
                currency=p.currency,
                description=p.description,
                thumbnail_url=thumbnail_url,
                supplier_id=p.supplier_id,
                specs=p.specs,
            )
        )
    return out


# ── GET /products/scrape-images?url=<url> ────────────────────────────────────

@router.get("/scrape-images", response_model=ScrapeImagesResponse)
async def scrape_product_images(
    url: str = Query(..., description="Product page URL to scrape images from"),
    _user: dict = Depends(require_architect),
) -> ScrapeImagesResponse:
    """
    Scrapes images from an external product page URL.
    Merges figmaTem GET /products/get-images?url= (sync requests → async httpx).
    Architect-only: prevents this endpoint being an open SSRF proxy.

    Security notes:
      - Timeout: 8 s hard limit
      - Max images returned: 20
      - TODO (prod): add IP allowlist blocking RFC-1918 + link-local ranges
      - og:image / twitter:image fallback for SPAs that render no <img> tags
    """
    if not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="url parameter required")

    try:
        async with httpx.AsyncClient(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Request to target URL timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch URL: {exc}")

    # Direct image URL — return immediately
    content_type = resp.headers.get("content-type", "")
    if content_type.startswith("image/"):
        return ScrapeImagesResponse(images=[url], source_url=url)

    soup = BeautifulSoup(resp.text, "html.parser")
    imgs: list[str] = []

    # Standard <img src="...">
    for tag in soup.find_all("img"):
        src = tag.get("src")
        if src:
            imgs.append(urljoin(url, src))
        if len(imgs) >= _MAX_SCRAPE_IMAGES:
            break

    # og:image / twitter:image fallback (covers SPAs, React-rendered pages)
    if not imgs:
        for tag in soup.find_all("meta"):
            prop = tag.get("property") or tag.get("name", "")
            if prop in ("og:image", "twitter:image"):
                content = tag.get("content")
                if content:
                    imgs.append(urljoin(url, content))

    if not imgs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No images found at the provided URL")

    return ScrapeImagesResponse(images=imgs[:_MAX_SCRAPE_IMAGES], source_url=url)


# ── GET /products/{product_id} ────────────────────────────────────────────────

@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> ProductDetail:
    """
    Full product detail — called ONLY when user taps an annotation pin.
    thumbnail_url is pre-signed (valid 1 hour) before return.
    Frontend caches this in Zustand store; subsequent taps skip this call.
    """
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    try:
        thumbnail_url = presign_product_thumbnail(product.thumbnail_s3_key)
    except RuntimeError:
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