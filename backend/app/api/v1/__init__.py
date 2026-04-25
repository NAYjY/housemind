"""app/api/v1/__init__.py — HouseMind"""
import os
from fastapi import APIRouter

from app.api.v1.annotations import router as annotations_router
from app.api.v1.auth import router as auth_router
from app.api.v1.images import router as images_router
from app.api.v1.products import router as products_router
from app.api.v1.projects import router as projects_router
from app.api.v1.users import router as users_router 

router = APIRouter()

router.include_router(auth_router)
router.include_router(projects_router)
router.include_router(annotations_router)
router.include_router(images_router)
router.include_router(products_router)
router.include_router(users_router)

if os.getenv("ENVIRONMENT", "local") in ("local", "test"):
    from app.api.v1.uploads import router as uploads_router
    router.include_router(uploads_router)