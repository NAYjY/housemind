"""
app/api/v1/images.py — HouseMind
Project image endpoints: S3 URL refresh + upload presign + confirm.

URL contract:
  GET  /api/v1/images/{image_id}/url    → refresh pre-signed GET URL (called on S3 403)
  POST /api/v1/images/upload-url        → get presigned PUT URL for direct upload
  POST /api/v1/images/confirm           → confirm upload succeeded; creates DB record

The upload flow is two-step (BLK-9 fix):
  1. Client calls POST /upload-url → receives presigned PUT URL + s3_key
  2. Client uploads file directly to S3 (PUT to presigned URL)
  3. Client calls POST /confirm → DB record created ONLY on confirmed upload

This guarantees S3 and DB are never out of sync in the write direction.
"""
from __future__ import annotations

import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_project_member, require_project_owner
from app.db.queries import get_active_image
from app.db.session import get_db
from app.models.project_image import ProjectImage
from app.schemas.annotation import (
    ProjectImageResponse,
    RefreshedImageUrl,
    UploadConfirmRequest,
    UploadPresignRequest,
    UploadPresignResponse,
)
from app.config import settings
from app.services.s3 import (
    make_project_image_key,
    presign_project_image,
    presign_project_image_upload,
)

router = APIRouter(prefix="/images", tags=["images"])


# ── GET /images/{image_id}/url ────────────────────────────────────────────────

@router.get("/{image_id}/url", response_model=RefreshedImageUrl)
async def refresh_image_url(
    image_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),
) -> RefreshedImageUrl:
    """
    Called by Frontend when a project image URL returns 403 (expired presigned URL).
    Returns a fresh 15-minute presigned GET URL.

    Frontend distinguishes S3 403 (no error_code field) from API 403
    (has error_code: "ACCESS_DENIED") — see error contract in Backend agent output.
    """
    image = await get_active_image(db, image_id)
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    try:
        url = presign_project_image(image.s3_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return RefreshedImageUrl(image_id=image_id, url=url, expires_in=900)


# ── POST /images/upload-url ───────────────────────────────────────────────────

@router.post("/upload-url", response_model=UploadPresignResponse)
async def get_upload_url(
    body: UploadPresignRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_owner),
) -> UploadPresignResponse:
    """
    Step 1 of image upload: return a presigned S3 PUT URL.
    The DB record is NOT created here — only after /confirm is called.

    Client must PUT the file to upload_url with the correct Content-Type header.
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
    """
    Step 2 of image upload: client confirms S3 upload succeeded.
    ProjectImage DB record is created HERE — not before upload is confirmed.

    This guarantees the DB never references an S3 object that failed to upload.
    """
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
    )
