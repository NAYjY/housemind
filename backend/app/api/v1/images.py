"""
app/api/v1/images.py — HouseMind

SEC-04  list_project_images now uses require_project_member which is a real
        membership check against project_members table.

SEC-14  Pagination added to list_project_images: limit/offset query params.
        Previously all images for a project were returned in one unbounded response.
"""
from __future__ import annotations

import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel as PydanticBase
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_project_member, require_project_architect
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
    presign_project_image_async,
    presign_project_image_upload_async,
)

router = APIRouter(prefix="/images", tags=["images"])


# ── GET /images?project_id=<uuid> ─────────────────────────────────────────────

@router.get("", response_model=list[ProjectImageResponse])
async def list_project_images(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(default=50, ge=1, le=200),   # SEC-14: pagination
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_project_member),   # SEC-04: real check
) -> list[ProjectImageResponse]:
    images = await list_active_images_for_project(db, project_id, limit=limit, offset=offset)

    result = []
    for image in images:
        try:
            url = await presign_project_image_async(image.s3_key)
        except RuntimeError:
            url = ""
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
    image = await get_active_image(db, image_id)
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    try:
        url = await presign_project_image_async(image.s3_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return RefreshedImageUrl(image_id=image_id, url=url, expires_in=900)


# ── POST /images/from-url ─────────────────────────────────────────────────────

class UrlImageRequest(PydanticBase):
    project_id: uuid.UUID
    url: str
    original_filename: str | None = None


@router.post("/from-url", response_model=ProjectImageResponse, status_code=status.HTTP_201_CREATED)
async def create_image_from_url(
    body: UrlImageRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
) -> ProjectImageResponse:
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
    user: dict = Depends(require_project_architect),
) -> UploadPresignResponse:
    ext = PurePosixPath(body.filename).suffix.lstrip(".").lower() or "jpg"
    image_id = uuid.uuid4()
    s3_key = make_project_image_key(str(body.project_id), str(image_id), ext)

    try:
        upload_url = await presign_project_image_upload_async(s3_key, body.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return UploadPresignResponse(upload_url=upload_url, s3_key=s3_key, expires_in=900)


# ── POST /images/confirm ──────────────────────────────────────────────────────

@router.post("/confirm", response_model=ProjectImageResponse, status_code=status.HTTP_201_CREATED)
async def confirm_upload(
    body: UploadConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
) -> ProjectImageResponse:
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
        url=None,
    )


# ── DELETE /images/{image_id} ─────────────────────────────────────────────────

@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: uuid.UUID,
    project_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_project_architect),
):
    image = await soft_delete_image_in_project(db, image_id, project_id)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found or already deleted",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
