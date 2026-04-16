"""
app/api/v1/__init__.py — HouseMind
Aggregates all v1 routers into a single APIRouter.
Imported by main.py and mounted at /v1.
"""
from fastapi import APIRouter

from app.api.v1.annotations import router as annotations_router
from app.api.v1.auth import router as auth_router
from app.api.v1.images import router as images_router
from app.api.v1.products import router as products_router

router = APIRouter()

# Auth routes (no JWT middleware — they ARE the auth entry points)
router.include_router(auth_router)

# Protected routes (all require JWT via dependency in each router)
router.include_router(annotations_router)
router.include_router(images_router)
router.include_router(products_router)
