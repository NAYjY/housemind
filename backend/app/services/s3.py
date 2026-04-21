"""
app/services/s3.py — HouseMind
Pre-signed URL generation for S3 assets.

Alignment fixes vs Backend agent draft:
  - AWS_REGION → AWS_DEFAULT_REGION       (DevOps canonical; standard AWS SDK name)
  - S3_BUCKET_PRODUCTS/PROJECTS → S3_BUCKET_NAME  (single bucket, prefix strategy)
    Key prefixes: products/thumbnails/<id>  |  projects/<pid>/images/<id>

Pre-sign expiry policy (per Backend agent spec):
  - Product thumbnails : 3600 s  (1 hour)
  - Project images     :  900 s  (15 minutes)
"""
from __future__ import annotations

import boto3
from botocore.exceptions import ClientError

from app.config import settings

# Key prefix constants — single source of truth
PREFIX_PRODUCT_THUMBNAILS = "products/thumbnails/"
PREFIX_PROJECT_IMAGES = "projects/"


# Module-level singleton — boto3 clients are thread-safe and meant to be reused.
# endpoint_url supports LocalStack in local dev (AWS_ENDPOINT_URL env var).
import os as _os

def _get_s3_client():
    kwargs: dict = dict(
        region_name=settings.AWS_DEFAULT_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )
    endpoint_url = _os.getenv("AWS_ENDPOINT_URL")
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("s3", **kwargs)

# Lazy singleton — created once per process on first use
_s3_client = None

def _get_s3_client_cached():
    global _s3_client
    if _s3_client is None:
        _s3_client = _get_s3_client()
    return _s3_client


# ── Pre-signed GET URLs ───────────────────────────────────────────────────────

def presign_product_thumbnail(s3_key: str) -> str:
    """
    Return a pre-signed GET URL for a product thumbnail.
    Valid for 1 hour (3 600 s). Frontend staleTime should be ≤ 3 300 000 ms (55 min).
    """
    # External URLs are stored directly in s3_key
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        return s3_key
    return _presign_get(s3_key, expiry=3600)


def presign_project_image(s3_key: str) -> str:
    """
    Return a pre-signed GET URL for a project image.
    Valid for 15 minutes (900 s). Frontend staleTime should be ≤ 600 000 ms (10 min).
    """
    # External URLs are stored directly in s3_key
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        return s3_key

    return _presign_get(s3_key, expiry=900)


def _rewrite_for_browser(url: str) -> str:
    """Rewrite Docker-internal localstack hostname to localhost for browser access."""
    if _os.getenv("ENVIRONMENT", "local") != "local":
        return url
    return (
        url
        .replace("http://localstack:", "http://localhost:")
        .replace("https://localstack:", "http://localhost:")
    )   
def _presign_get(s3_key: str, expiry: int) -> str:
    client = _get_s3_client_cached()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expiry,
        )
        return _rewrite_for_browser(url)
    except ClientError as exc:
        raise RuntimeError(f"S3 presign (GET) failed for key={s3_key!r}: {exc}") from exc


def presign_product_thumbnail_upload(s3_key: str, content_type: str) -> str:
    """Presigned PUT URL for product thumbnail upload. Valid 15 min."""
    client = _get_s3_client_cached()
    try:
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )
        return _rewrite_for_browser(url)
    except ClientError as exc:
        raise RuntimeError(f"S3 presign (PUT) failed for key={s3_key!r}: {exc}") from exc
# ── Pre-signed PUT URLs (upload) ─────────────────────────────────────────────

def presign_project_image_upload(s3_key: str, content_type: str) -> str:
    """
    Return a pre-signed PUT URL for direct client-to-S3 upload.
    Valid for 15 minutes. Client must supply Content-Type header matching content_type.

    IMPORTANT: The ProjectImage DB record must NOT be created until the client
    confirms a successful upload (POST /api/v1/images/confirm). This function
    only returns the URL — record creation is the caller's responsibility AFTER
    receiving the confirm request.
    """
    client = _get_s3_client_cached()
    try:
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )
        return _rewrite_for_browser(url)
    except ClientError as exc:
        raise RuntimeError(f"S3 presign (PUT) failed for key={s3_key!r}: {exc}") from exc


def make_project_image_key(project_id: str, image_id: str, extension: str) -> str:
    """Canonical S3 key for a project image."""
    return f"{PREFIX_PROJECT_IMAGES}{project_id}/images/{image_id}.{extension}"


def make_product_thumbnail_key(product_id: str, extension: str) -> str:
    """Canonical S3 key for a product thumbnail."""
    return f"{PREFIX_PRODUCT_THUMBNAILS}{product_id}.{extension}"
