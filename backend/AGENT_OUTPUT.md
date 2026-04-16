# Backend Agent Output — HouseMind
## Tasks: Annotations endpoint · S3 pre-signed URLs · Role-based access

---

# Task 1 — Annotation endpoint: productId + thumbnailUrl only

## Pydantic Schemas

```python
# schemas/annotation.py
from pydantic import BaseModel
from uuid import UUID


class AnnotationSummary(BaseModel):
    annotation_id: UUID
    product_id: UUID
    thumbnail_url: str
    position_x: float
    position_y: float

    model_config = {"from_attributes": True}


class ProductDetail(BaseModel):
    product_id: UUID
    name: str
    brand: str | None
    model: str | None
    price: float | None
    description: str | None
    thumbnail_url: str
    metadata: dict | None  # flexible JSONB — swap for structured fields once DB schema confirmed

    model_config = {"from_attributes": True}
```

## SQLAlchemy Models

```python
# models.py
import uuid
from sqlalchemy import Column, Float, ForeignKey, String, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from database import Base


class Annotation(Base):
    __tablename__ = "annotations"

    annotation_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id      = Column(UUID(as_uuid=True), ForeignKey("project_images.image_id"), nullable=False, index=True)
    product_id    = Column(UUID(as_uuid=True), ForeignKey("products.product_id"), nullable=False)
    position_x    = Column(Float, nullable=False)
    position_y    = Column(Float, nullable=False)
    deleted_at    = Column(String, nullable=True)  # TIMESTAMPTZ — soft delete

    __table_args__ = (
        CheckConstraint("position_x BETWEEN 0.0 AND 1.0", name="chk_position_x"),
        CheckConstraint("position_y BETWEEN 0.0 AND 1.0", name="chk_position_y"),
    )

    product = relationship("Product", lazy="joined")


class Product(Base):
    __tablename__ = "products"

    product_id    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String, nullable=False)
    brand         = Column(String, nullable=True)
    model         = Column(String, nullable=True)
    price         = Column(Float, nullable=True)
    description   = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=False)
    metadata_json = Column(JSONB, nullable=True)
```

## FastAPI Routes

```python
# routers/annotations.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from database import get_db
from models import Annotation, Product
from schemas.annotation import AnnotationSummary, ProductDetail
from auth import require_project_member  # any role with valid JWT

router = APIRouter(prefix="/api/v1", tags=["annotations"])


@router.get("/annotations", response_model=list[AnnotationSummary])
async def get_annotations(
    image_id: UUID = Query(..., description="ID of the project image"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_project_member),
):
    """
    Returns lightweight annotation list for a given image.
    Fetches product thumbnail via joined load — avoids N+1.
    Full product detail is a separate call per annotation tap.
    """
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.image_id == image_id,
            Annotation.deleted_at.is_(None),  # soft-delete filter
        )
    )
    annotations = result.scalars().all()

    return [
        AnnotationSummary(
            annotation_id=a.annotation_id,
            product_id=a.product_id,
            thumbnail_url=a.product.thumbnail_url,
            position_x=a.position_x,
            position_y=a.position_y,
        )
        for a in annotations
    ]


@router.get("/products/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_project_member),
):
    """
    Called only on annotation tap — keeps initial payload small.
    """
    result = await db.execute(
        select(Product).where(Product.product_id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
```

## Flags — Task 1

```
⚠ DB SCHEMA OPEN: products table structure (JSONB vs structured columns) not yet confirmed.
  ProductDetail.metadata typed as dict for now — restructure once operations confirm fields.

⚠ N+1 RISK: lazy="joined" on Annotation.product fetches thumbnail in one query.
  Confirm with DB engineer that index on annotations.product_id exists.

⚠ INDEX REQUIRED: annotations.image_id must be indexed (confirmed in DB decisions).
  Verify composite index (image_id, deleted_at) for soft-delete filter performance.

→ FLAG TO FRONTEND: thumbnail_url in annotation response is a raw S3 path, not pre-signed.
  Pre-signing happens at the image layer (Task 2). Coordinate which URLs need signing.
```

---

# Task 2 — Pre-signed S3 URL expiry: 1hr thumbnails / 15min project images

## S3 Service

```python
# services/s3.py
import boto3
from botocore.exceptions import ClientError
from functools import lru_cache
from config import settings


@lru_cache
def get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


BUCKET_CONFIG = {
    "products": {
        "bucket": settings.S3_BUCKET_PRODUCTS,   # housemind-products
        "expiry": 3600,                            # 1 hour
    },
    "project_images": {
        "bucket": settings.S3_BUCKET_PROJECTS,    # housemind-projects (private)
        "expiry": 900,                             # 15 minutes
    },
}


def generate_presigned_url(object_key: str, url_type: str) -> str:
    """
    url_type: "products" | "project_images"
    Returns a pre-signed GET URL valid for the configured expiry.
    Raises ValueError for unknown url_type.
    """
    config = BUCKET_CONFIG.get(url_type)
    if not config:
        raise ValueError(f"Unknown URL type: {url_type}")

    client = get_s3_client()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": config["bucket"], "Key": object_key},
            ExpiresIn=config["expiry"],
        )
        return url
    except ClientError as e:
        raise RuntimeError(f"S3 presign failed: {e}") from e
```

## Refresh Endpoint

```python
# routers/images.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import ProjectImage
from services.s3 import generate_presigned_url
from auth import require_project_member

router = APIRouter(prefix="/api/v1", tags=["images"])


class RefreshedUrl(BaseModel):
    image_id: UUID
    url: str
    expires_in: int  # seconds — lets frontend set React Query staleTime correctly


@router.get("/images/{image_id}/url", response_model=RefreshedUrl)
async def refresh_image_url(
    image_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_project_member),
):
    """
    Called by frontend when a project image URL returns 403.
    Returns a fresh pre-signed URL for the same S3 object.
    """
    result = await db.execute(
        select(ProjectImage).where(ProjectImage.image_id == image_id)
    )
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        url = generate_presigned_url(image.s3_key, "project_images")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return RefreshedUrl(image_id=image_id, url=url, expires_in=900)
```

## Error Response Contract for Frontend

```python
# When S3 returns 403 to the client, frontend calls the refresh endpoint.
# To help frontend distinguish expired-URL 403 from access-denied 403,
# all our own 403s include a machine-readable error_code field:

# Access denied (RBAC):
{
    "detail": "Forbidden",
    "error_code": "ACCESS_DENIED"
}

# This is distinct from an S3 403, which comes directly from S3
# and has no error_code field. Frontend checks: if error_code is absent → S3 expired → call /images/:id/url
```

## Flags — Task 2

```
⚠ RAILWAY IAM NOTE: Railway may not support IAM role-based S3 auth cleanly in all regions.
  Use access key + secret (not instance profile) until Railway IAM behaviour confirmed by devops.
  Store as Railway env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.

⚠ REACT QUERY CACHE TTL: Frontend must set staleTime below expiry:
  - Product thumbnails: staleTime < 3,600,000ms (recommend 3,300,000 — 55min)
  - Project images: staleTime < 900,000ms (recommend 600,000 — 10min)
  → SEND THIS TO FRONTEND in writing.

⚠ PRODUCT THUMBNAIL SIGNING: Currently thumbnail_url in the products table is a raw S3 key.
  Two options: (a) sign on every GET /products/:id response, or (b) store public CDN URL via CloudFront.
  CloudFront option pending founder decision on custom domain. Until then, sign on response.

→ FLAG TO DEVOPS: confirm ap-southeast-1 S3 bucket names and IAM policy before wiring env vars.
```

---

# Task 3 — Role-based access: architect owner / contractor + homeowner read-only

## JWT Auth Dependencies

```python
# auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import jwt

from config import settings
from database import get_db
from models import Project

bearer_scheme = HTTPBearer()

# ── Configurable identifier field ────────────────────────────────────────────
# Pending DB confirmation: JWT uses user_id (UUID) or email as identifier.
# Set USER_ID_FIELD in config to switch without changing route code.
USER_ID_FIELD = settings.JWT_USER_ID_FIELD  # "user_id" | "email"


def decode_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            algorithms=["HS256"],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(payload: dict = Depends(decode_token)) -> dict:
    """
    Extracts user identity from JWT.
    Returns dict with: user_identifier, role
    """
    role = payload.get("role")
    user_id = payload.get(USER_ID_FIELD)

    if not role or not user_id:
        raise HTTPException(status_code=401, detail="Malformed token — missing role or user identifier")

    return {"user_id": user_id, "role": role}


# ── Role guards ───────────────────────────────────────────────────────────────

def require_project_member(user=Depends(get_current_user)) -> dict:
    """Any authenticated user. Used on all read endpoints."""
    return user


def require_architect(user=Depends(get_current_user)) -> dict:
    """Write operations only. Rejects contractor and homeowner."""
    if user["role"] != "architect":
        raise HTTPException(
            status_code=403,
            detail="Forbidden",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user


# ── Project ownership check ───────────────────────────────────────────────────

async def require_project_owner(
    project_id: str,
    user=Depends(require_architect),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Confirms the architect JWT user actually owns this specific project.
    Prevents architect A from mutating architect B's project.
    """
    result = await db.execute(
        select(Project).where(
            Project.project_id == project_id,
            Project.architect_id == user["user_id"],
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=403,
            detail="You do not own this project",
            headers={"X-Error-Code": "ACCESS_DENIED"},
        )
    return user
```

## Usage Pattern in Routes

```python
# routers/annotations.py (write operations)
from auth import require_architect, require_project_owner

@router.post("/annotations")
async def create_annotation(
    body: CreateAnnotationRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_project_owner),   # architect + owns project
):
    ...

@router.delete("/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_project_owner),
):
    # soft delete
    ...

# Read — any role
@router.get("/annotations")
async def get_annotations(
    image_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_project_member),  # contractor, homeowner, architect all OK
):
    ...
```

## Config

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    JWT_SECRET: str
    JWT_USER_ID_FIELD: str = "user_id"  # swap to "email" via env var — no code change needed

    AWS_REGION: str = "ap-southeast-1"
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    S3_BUCKET_PRODUCTS: str
    S3_BUCKET_PROJECTS: str

    class Config:
        env_file = ".env"

settings = Settings()
```

## Flags — Task 3

```
⚠ JWT IDENTIFIER OPEN: USER_ID_FIELD is config-driven ("user_id" | "email").
  → DATABASE must confirm before JWT tokens are issued.
  UUID preferred for immutability. Do not ship magic links until this is resolved.

⚠ SUPPLIER ROLE MISSING: Current RBAC only covers architect / contractor / homeowner.
  Supplier role is in the product brief but has no access policy defined yet.
  Recommend: treat Supplier as read-only (same as contractor) until scoped.

⚠ PROJECT OWNERSHIP CHECK IS A DB QUERY on every write: ensure composite index
  (architect_id, project_id) exists on projects table.
  → FLAG TO DATABASE engineer.

⚠ MAGIC LINK ROUTES: POST /invite-requests and POST /auth/magic-link must be
  explicitly excluded from JWT validation — they are the auth entry points.
  Do not run bearer_scheme on these routes.
```

---

# Cross-task Flags

```
→ OPEN BLOCKER (all 3 tasks): DB schema not finalized.
  JWT field, products table structure, and S3 key format all depend on schema confirmation.
  Backend can ship Task 1 read path and Task 3 role guards now.
  Task 2 refresh endpoint and Task 1 write path need schema lock first.

→ ENV VARS REQUIRED (send to devops):
  JWT_SECRET, JWT_USER_ID_FIELD,
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
  S3_BUCKET_PRODUCTS, S3_BUCKET_PROJECTS

→ SEND TO FRONTEND:
  - Error response shape: {detail: string, error_code?: string}
  - React Query staleTime values: 3,300,000ms (thumbnails), 600,000ms (project images)
  - 403 without error_code = S3 expired → call /images/:id/url
  - 403 with error_code = ACCESS_DENIED → show permission error, do not retry
```
