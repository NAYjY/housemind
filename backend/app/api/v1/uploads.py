"""
app/api/v1/uploads.py — HouseMind
Local dev file storage. Handles PUT (upload) and GET (serve) for files
stored on disk at /app/uploads/. Only active in local/test environments.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

router = APIRouter(prefix="/uploads", tags=["uploads"])

_UPLOAD_DIR = Path("/app/uploads")


def _safe_path(s3_key: str) -> Path:
    """Resolve path and ensure it stays within _UPLOAD_DIR."""
    path = (_UPLOAD_DIR / s3_key).resolve()
    if not str(path).startswith(str(_UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return path


@router.put("/{s3_key:path}")
async def upload_file(s3_key: str, request: Request) -> Response:
    if os.getenv("ENVIRONMENT", "local") not in ("local", "test"):
        raise HTTPException(status_code=404)
    path = _safe_path(s3_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = await request.body()
    path.write_bytes(body)
    return Response(status_code=200)


@router.get("/{s3_key:path}")
async def serve_file(s3_key: str) -> FileResponse:
    if os.getenv("ENVIRONMENT", "local") not in ("local", "test"):
        raise HTTPException(status_code=404)
    path = _safe_path(s3_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)