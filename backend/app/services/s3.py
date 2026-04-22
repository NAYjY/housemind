"""
app/services/s3.py — HouseMind
Pre-signed URL generation for S3 assets.

SEC-11 fix: _sanitize_extension() added.
  Previously `ext = PurePosixPath(body.filename).suffix.lstrip(".").lower()`
  was used to build S3 keys.  A filename like "image.jpg/../../../other.php"
  or "image.php%00.jpg" could produce a key outside the expected prefix,
  potentially overwriting keys in another project's namespace.
  _sanitize_extension() restricts to a strict allowlist of image extensions.
"""
from __future__ import annotations

import os as _os
import re

import boto3
from botocore.exceptions import ClientError

from app.config import settings

PREFIX_PRODUCT_THUMBNAILS = "products/thumbnails/"
PREFIX_PROJECT_IMAGES = "projects/"

# SEC-11: allowlist of permitted image extensions.  Anything else falls back
# to "jpg".  The regex intentionally excludes ".php", ".svg" (XSS vector
# when served without Content-Type), ".html", and path separators.
_ALLOWED_EXTENSIONS = frozenset({
    "jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif",
})
_SAFE_EXT_RE = re.compile(r"^[a-z0-9]{1,10}$")


def _sanitize_extension(raw_ext: str) -> str:
    """
    Accept only known-safe image extensions.

    Args:
        raw_ext: Raw extension string, WITH or WITHOUT leading dot.

    Returns:
        Lowercase alphanumeric extension string without dot, e.g. "jpg".
        Falls back to "jpg" for anything unknown or unsafe.
    """
    ext = raw_ext.lstrip(".").lower()
    # Strip anything after a null byte, space, or path separator
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


# ── Pre-signed GET URLs ───────────────────────────────────────────────────────

def presign_product_thumbnail(s3_key: str) -> str:
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        return s3_key
    return _presign_get(s3_key, expiry=3600)


def presign_project_image(s3_key: str) -> str:
    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        return s3_key
    return _presign_get(s3_key, expiry=900)


def _rewrite_for_browser(url: str) -> str:
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


# ── Pre-signed PUT URLs (upload) ──────────────────────────────────────────────

def presign_product_thumbnail_upload(s3_key: str, content_type: str) -> str:
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


def presign_project_image_upload(s3_key: str, content_type: str) -> str:
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
    """
    SEC-11: extension sanitized before embedding in key.
    """
    safe_ext = _sanitize_extension(extension)
    return f"{PREFIX_PROJECT_IMAGES}{project_id}/images/{image_id}.{safe_ext}"


def make_product_thumbnail_key(product_id: str, extension: str) -> str:
    """
    SEC-11: extension sanitized before embedding in key.
    """
    safe_ext = _sanitize_extension(extension)
    return f"{PREFIX_PRODUCT_THUMBNAILS}{product_id}.{safe_ext}"
