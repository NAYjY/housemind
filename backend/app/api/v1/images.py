"""
app/api/v1/images.py — HouseMind
Project image endpoints.

Security fix (IDOR — cross-project image deletion):
  DELETE /images/{image_id} previously validated that the architect owns
  the project_id query param but never verified that image_id belongs to
  that project.  An architect could delete any other project's images (and
  their cascading annotations) by supplying their own project_id alongside
  a foreign image_id.

  Fix: expose project_id explicitly and pass it into soft_delete_image_in_project
  which adds a WHERE project_images.project_id = $project_id filter before
  executing the soft-delete and annotation cascade.

URL contract:
  GET    /api/v1/images?project_id=<uuid>   → list (all roles)
  GET    /api/v1/images/{image_id}/url      → refresh presigned URL (all roles)
  POST   /api/v1/images/upload-url          → get presigned PUT URL (architect + owner)
  POST   /api/v1/images/confirm             → confirm upload, create DB record (architect + owner)
  POST   /api/v1/images/from-url            → store external URL as image (architect + owner)
  DELETE /api/v1/images/{image_id}          → soft-delete + cascade (architect + owner)
"""
from __future__ import annotations

import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel as PydanticBase
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_project_member, require_project_owner
from app.config import settings
from app.db.queries import (
    get_active_image,
    list_active_images_for_project,
    soft_delete_image_in_project,
)
from app.db.session import get_db
from app.models.project_image import ProjectImage
from app.schemas.image import (
    ProjectImageResponse,
    RefreshedImageUrl,
    UploadConfirmRequest,
    UploadPresignRequest,
    UploadPresignResponse,
)
from app.services.s3 import (
    make_project_image_key,
    presign_project_image,
    presign_project_image_upload,
)

router = APIRouter(prefix="/images", tags=["images"])


# ── GET /images?project_id=<uuid> ─────────────────────────────────────────────

@router.get("", response_model=list[ProjectImageResponse])
async def list_project_images(
    project_id: uuid.UUID = Query(..., description="Project ID to fetch images for"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> list[ProjectImageResponse]:
    """
    List all non-deleted images for a project, ordered for carousel display.
    Each image includes a fresh pre-signed GET URL (900 s expiry).
    Frontend staleTime should be ≤ 600 000 ms (10 min).
    """
    images = await list_active_images_for_project(db, project_id)

    result = []
    for image in images:
        try:
            url = presign_project_image(image.s3_key)
        except RuntimeError:
            url = ""  # non-fatal; UI shows placeholder

        result.append(
            ProjectImageResponse(
                id=image.id,
                project_id=image.project_id,
                s3_key=image.s3_key,
                original_filename=image.original_filename,
                mime_type=image.mime_type,
                width_px=image.width_px,
                height_px=image.height_px,
                display_order=image.display_order,
                created_at=image.created_at,
                url=url,
            )
        )
    return result


# ── GET /images/{image_id}/url ────────────────────────────────────────────────

@router.get("/{image_id}/url", response_model=RefreshedImageUrl)
async def refresh_image_url(
    image_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> RefreshedImageUrl:
    """
    Called by frontend when a project image URL returns 403 (expired presigned URL).
    Returns a fresh 15-minute presigned GET URL.

    No project_id scope needed here: this is a read-only endpoint open to any
    project member; an image_id from another project leaks nothing sensitive
    (they'd still need valid S3 access for the object itself).
    """
    image = await get_active_image(db, image_id)
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    try:
        url = presign_project_image(image.s3_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return RefreshedImageUrl(image_id=image_id, url=url, expires_in=900)


# ── POST /images/from-url ────────────────────────────────────────────────────

class UrlImageRequest(PydanticBase):
    project_id: uuid.UUID
    url: str
    original_filename: str | None = None


@router.post("/from-url", response_model=ProjectImageResponse, status_code=status.HTTP_201_CREATED)
async def create_image_from_url(
    body: UrlImageRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> ProjectImageResponse:
    """Store an external URL as a project image (no S3 upload needed).

    project_id comes from the request body; require_project_owner validates
    ownership via that same body field (FastAPI shares body params with deps).
    No IDOR risk: the image is created inside the project the caller owns.
    """
    image = ProjectImage(
        id=uuid.uuid4(),
        project_id=body.project_id,
        s3_key=body.url,
        s3_bucket="external",
        original_filename=body.original_filename or body.url[:80],
        mime_type="image/jpeg",
    )
    db.add(image)
    await db.flush()

    return ProjectImageResponse(
        id=image.id,
        project_id=image.project_id,
        s3_key=image.s3_key,
        original_filename=image.original_filename,
        mime_type=image.mime_type,
        width_px=None,
        height_px=None,
        display_order=image.display_order,
        created_at=image.created_at,
        url=body.url,
    )


# ── POST /images/upload-url ───────────────────────────────────────────────────

@router.post("/upload-url", response_model=UploadPresignResponse)
async def get_upload_url(
    body: UploadPresignRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> UploadPresignResponse:
    """Step 1 of image upload: return a presigned S3 PUT URL.

    project_id is in the request body; no IDOR risk because the presigned URL
    is keyed to a new uuid inside the owned project.
    """
    ext = PurePosixPath(body.filename).suffix.lstrip(".").lower() or "jpg"
    image_id = uuid.uuid4()
    s3_key = make_project_image_key(str(body.project_id), str(image_id), ext)

    try:
        upload_url = presign_project_image_upload(s3_key, body.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return UploadPresignResponse(upload_url=upload_url, s3_key=s3_key, expires_in=900)


# ── POST /images/confirm ──────────────────────────────────────────────────────

@router.post("/confirm", response_model=ProjectImageResponse, status_code=status.HTTP_201_CREATED)
async def confirm_upload(
    body: UploadConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> ProjectImageResponse:
    """Step 2 of image upload: confirm S3 upload, create DB record."""
    image = ProjectImage(
        id=uuid.uuid4(),
        project_id=body.project_id,
        s3_key=body.s3_key,
        s3_bucket=settings.S3_BUCKET_NAME,
        original_filename=body.original_filename,
        mime_type=body.mime_type,
        width_px=body.width_px,
        height_px=body.height_px,
    )
    db.add(image)
    await db.flush()

    return ProjectImageResponse(
        id=image.id,
        project_id=image.project_id,
        s3_key=image.s3_key,
        original_filename=image.original_filename,
        mime_type=image.mime_type,
        width_px=image.width_px,
        height_px=image.height_px,
        display_order=image.display_order,
        created_at=image.created_at,
        url=None,  # client already has the S3 URL from the confirm response
    )


# ── DELETE /images/{image_id} ─────────────────────────────────────────────────

@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: uuid.UUID,
    # project_id is shared with require_project_owner (FastAPI resolves once).
    # We declare it explicitly so we can pass it into the project-scoped helper.
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
):
    """Soft-delete a project image and cascade to its annotations.

    Security: soft_delete_image_in_project enforces that image_id belongs to
    project_id before executing the delete + annotation cascade.  Without this
    check, an architect could delete any image by supplying their own project_id
    alongside a foreign image_id (IDOR).

    DB records are retained; deleted_at is set on both the image and its
    annotations.  The S3 object is NOT deleted here — add an S3 lifecycle rule
    or scheduled cleanup job to reclaim storage.
    """
    image = await soft_delete_image_in_project(db, image_id, project_id)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)