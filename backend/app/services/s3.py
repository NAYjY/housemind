"""
app/services/s3.py — HouseMind
Pre-signed URL generation for S3 assets.

In local/test environments, files are stored on disk at /app/uploads/
and served via GET /api/v1/uploads/{path}. No localstack needed.
In staging/production, real S3 is used.
"""
from __future__ import annotations

import asyncio
import os as _os
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.config import settings

PREFIX_PRODUCT_THUMBNAILS = "products/thumbnails/"
PREFIX_PROJECT_IMAGES = "projects/"

_ALLOWED_PREFIXES = (
    PREFIX_PRODUCT_THUMBNAILS,
    PREFIX_PROJECT_IMAGES,
)
_ALLOWED_EXTENSIONS = frozenset({
    "jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif",
})
_SAFE_EXT_RE = re.compile(r"^[a-z0-9]{1,10}$")

_LOCAL_UPLOAD_DIR = Path("/app/uploads")

def _IS_LOCAL() -> bool:
    return _os.getenv("ENVIRONMENT", "local") in ("local", "test")

def _validate_s3_key(key: str) -> None:
    """Reject keys that don't belong to a known prefix — prevents cross-tenant presign."""
    if not any(key.startswith(p) for p in _ALLOWED_PREFIXES):
        raise ValueError(f"Unauthorized S3 key: {key!r}")

def _sanitize_extension(raw_ext: str) -> str:
    ext = raw_ext.lstrip(".").lower()
    ext = re.split(r"[\x00\s/\\?#]", ext)[0]
    if not _SAFE_EXT_RE.match(ext):
        return "jpg"
    if ext not in _ALLOWED_EXTENSIONS:
        return "jpg"
    return ext


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


_s3_client = None


def _get_s3_client_cached():
    global _s3_client
    if _s3_client is None:
        _s3_client = _get_s3_client()
    return _s3_client


def _local_file_url(s3_key: str) -> str:
    """Return a URL the browser can fetch for a local file — always through nginx proxy."""
    public_host = _os.getenv("PUBLIC_HOST", "localhost:5000")
    scheme = _os.getenv("PUBLIC_SCHEME", "http")
    return f"{scheme}://{public_host}/api/v1/uploads/{s3_key}"


def _local_upload_path(s3_key: str) -> Path:
    path = _LOCAL_UPLOAD_DIR / s3_key
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


# ── Pre-signed GET URLs ───────────────────────────────────────────────────────

def presign_product_thumbnail(s3_key: str) -> str:
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        try:
            from app.services.ssrf_guard import validate_url_against_ssrf
            validate_url_against_ssrf(s3_key, require_https=True)
        except Exception:
            return ""
        return s3_key
    if not s3_key:
        return ""
    _validate_s3_key(s3_key)
    if _IS_LOCAL():
        p = _local_upload_path(s3_key)
        if p.exists():
            return _local_file_url(s3_key)
        return ""
    return _presign_get(s3_key, expiry=3600)


def presign_project_image(s3_key: str) -> str:
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        return s3_key
    if not s3_key:
        return ""
    _validate_s3_key(s3_key)

    if _IS_LOCAL():
        p = _local_upload_path(s3_key)
        if p.exists():
            return _local_file_url(s3_key)
        return ""
    return _presign_get(s3_key, expiry=900)


def _presign_get(s3_key: str, expiry: int) -> str:
    client = _get_s3_client_cached()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expiry,
        )
        return url
    except ClientError as exc:
        raise RuntimeError(f"S3 presign (GET) failed for key={s3_key!r}: {exc}") from exc


# ── Pre-signed PUT URLs (upload) ──────────────────────────────────────────────

def presign_product_thumbnail_upload(s3_key: str, content_type: str) -> str:
    if _IS_LOCAL():
        public_host = _os.getenv("PUBLIC_HOST", "localhost:5000")
        scheme = _os.getenv("PUBLIC_SCHEME", "http")
        return f"{scheme}://{public_host}/api/v1/uploads/{s3_key}"
    return _presign_put(s3_key, content_type)


def presign_project_image_upload(s3_key: str, content_type: str) -> str:
    if _IS_LOCAL():
        public_host = _os.getenv("PUBLIC_HOST", "localhost:5000")
        scheme = _os.getenv("PUBLIC_SCHEME", "http")
        return f"{scheme}://{public_host}/api/v1/uploads/{s3_key}"
    return _presign_put(s3_key, content_type)


def _presign_put(s3_key: str, content_type: str) -> str:
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
        return url
    except ClientError as exc:
        raise RuntimeError(f"S3 presign (PUT) failed for key={s3_key!r}: {exc}") from exc


def make_project_image_key(project_id: str, image_id: str, extension: str) -> str:
    safe_ext = _sanitize_extension(extension)
    return f"{PREFIX_PROJECT_IMAGES}{project_id}/images/{image_id}.{safe_ext}"


def make_product_thumbnail_key(product_id: str, extension: str) -> str:
    safe_ext = _sanitize_extension(extension)
    return f"{PREFIX_PRODUCT_THUMBNAILS}{product_id}.{safe_ext}"

# ── Thread pool for blocking boto3 calls ─────────────────────────────────────
# boto3 is synchronous. Running it directly on the async event loop blocks all
# other coroutines. A dedicated executor keeps the loop free.
_s3_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="s3-presign")


async def presign_product_thumbnail_async(s3_key: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _s3_executor, partial(presign_product_thumbnail, s3_key)
    )


async def presign_project_image_async(s3_key: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _s3_executor, partial(presign_project_image, s3_key)
    )


async def presign_product_thumbnail_upload_async(s3_key: str, content_type: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _s3_executor, partial(presign_product_thumbnail_upload, s3_key, content_type)
    )


async def presign_project_image_upload_async(s3_key: str, content_type: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _s3_executor, partial(presign_project_image_upload, s3_key, content_type)
    )