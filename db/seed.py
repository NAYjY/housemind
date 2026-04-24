#!/usr/bin/env python3
"""
db/seed.py — HouseMind
Development + staging seed script.

Creates deterministic test data using fixed UUIDs so Playwright tests
can reference known project/image IDs via environment variables.

Usage:
    # From backend directory, after alembic upgrade head:
    python ../db/seed.py

    # Or via Make:
    make db-seed

Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
NEVER run against production.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
import bcrypt

# Allow running from project root or backend directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://housemind:housemind@localhost:5432/housemind_dev",
)

def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

# ── Fixed UUIDs (deterministic — match TEST_* env vars in CI) ────────────────
ARCHITECT_ID   = uuid.UUID("00000001-0000-0000-0000-000000000001")
CONTRACTOR_ID  = uuid.UUID("00000001-0000-0000-0000-000000000002")
HOMEOWNER_ID   = uuid.UUID("00000001-0000-0000-0000-000000000003")
SUPPLIER_ID    = uuid.UUID("00000001-0000-0000-0000-000000000004")
PROJECT_ID     = uuid.UUID("00000002-0000-0000-0000-000000000001")
IMAGE_ID       = uuid.UUID("00000003-0000-0000-0000-000000000001")
PRODUCT_ID     = uuid.UUID("00000004-0000-0000-0000-000000000001")
ANNOTATION_ID  = uuid.UUID("00000005-0000-0000-0000-000000000001")
arch_pw=_hash("architect123")
contr_pw=_hash("contractor123")
home_pw=_hash("homeowner123")
supp_pw=_hash("supplier123")


async def seed(session: AsyncSession) -> None:
    env = os.getenv("ENVIRONMENT", "local")
    if env == "production":
        print("❌ Refusing to seed production database. Set ENVIRONMENT=local or staging.")
        sys.exit(1)

    print(f"Seeding {env} database at {DATABASE_URL[:40]}...")

    # ── Users ────────────────────────────────────────────────────────────────
    await session.execute(text("""
        INSERT INTO users (id, email, full_name, role, preferred_language, password_hash)
        VALUES
          (:architect_id,  'architect@housemind.com',  'สมชาย สถาปนิก',  'architect',  'th', :arch_pw),
          (:contractor_id, 'contractor@housemind.com', 'สมหญิง ผูรับเหมา', 'contractor', 'th', :contr_pw),
          (:homeowner_id,  'homeowner@housemind.com',  'สมศรี เจาของบาน',  'homeowner',  'th', :home_pw),
          (:supplier_id,   'supplier@housemind.com',   'บริษัท วัสดุ จำกัด', 'supplier', 'th', :supp_pw)
        ON CONFLICT (id) DO NOTHING
    """), {
        "architect_id": ARCHITECT_ID,
        "contractor_id": CONTRACTOR_ID,
        "homeowner_id": HOMEOWNER_ID,
        "supplier_id": SUPPLIER_ID,
        "arch_pw": arch_pw,
        "contr_pw": contr_pw,
        "home_pw": home_pw,
        "supp_pw": supp_pw,
    })
    print("  ✓ Users seeded")

    # ── Project ───────────────────────────────────────────────────────────────
    await session.execute(text("""
        INSERT INTO projects (id, architect_id, name, description, status)
        VALUES (
            :project_id, :architect_id,
            'บ้านพักอาศัย สุขุมวิท 101',
            'โครงการบ้านพักอาศัย 2 ชั้น พื้นที่ 250 ตร.ม.',
            'active'
        )
        ON CONFLICT (id) DO NOTHING
    """), {"project_id": PROJECT_ID, "architect_id": ARCHITECT_ID})
    print("  ✓ Project seeded")

    # ── Project image ─────────────────────────────────────────────────────────
    await session.execute(text("""
        INSERT INTO project_images (id, project_id, s3_key, s3_bucket, mime_type, display_order)
        VALUES (
            :image_id, :project_id,
            'projects/00000002-0000-0000-0000-000000000001/images/living-room.jpg',
            'housemind-dev-bucket',
            'image/jpeg',
            0
        )
        ON CONFLICT (id) DO NOTHING
    """), {"image_id": IMAGE_ID, "project_id": PROJECT_ID})
    print("  ✓ Project image seeded")

    # ── Product ───────────────────────────────────────────────────────────────
    await session.execute(text("""
        INSERT INTO products (
            id, supplier_id, name, brand, model,
            price, currency, description, thumbnail_s3_key, specs
        )
        VALUES (
            :product_id, :supplier_id,
            'กระเบื้องโมเสค ขาว-เทา 30×30',
            'SCG',
            'CERAMIC-30-WG',
            285.0,
            'THB',
            'กระเบื้องโมเสคสำหรับห้องน้ำและพื้นที่เปียก ความหนา 8mm กันลื่น',
            'products/thumbnails/00000004-0000-0000-0000-000000000001.jpg',
            '{"ขนาด": "30×30 cm", "หนา": "8 mm", "ผิว": "กันลื่น", "วัสดุ": "เซรามิค"}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING
    """), {"product_id": PRODUCT_ID, "supplier_id": SUPPLIER_ID})
    print("  ✓ Product seeded")

    # ── Annotation ────────────────────────────────────────────────────────────
    # FIX: removed linked_product_id column — it was dropped in migration 005.
    # object_id=101 links to the emoji category group (was linked_product_id FK).
    await session.execute(text("""
        INSERT INTO annotations (
            id, image_id, created_by,
            object_id, position_x, position_y, label, note
        )
        VALUES (
            :annotation_id, :image_id, :architect_id,
            101, 0.42, 0.71,
            'พื้น - บริเวณห้องน้ำ',
            'ใช้กระเบื้องโมเสค SCG สำหรับพื้นห้องน้ำทั้งหมด'
        )
        ON CONFLICT (id) DO NOTHING
    """), {
        "annotation_id": ANNOTATION_ID,
        "image_id": IMAGE_ID,
        "architect_id": ARCHITECT_ID,
    })
    print("  ✓ Annotation seeded")

    # ── Link product to project via object_products ───────────────────────────
    await session.execute(text("""
        INSERT INTO object_products (id, project_id, object_id, product_id)
        VALUES (gen_random_uuid(), :project_id, 101, :product_id)
        ON CONFLICT ON CONSTRAINT uq_object_products_project_object_product DO NOTHING
    """), {"project_id": PROJECT_ID, "product_id": PRODUCT_ID})
    print("  ✓ object_products link seeded")

    # ── Invite tokens ─────────────────────────────────────────────────────────
    for email, role in [
        ("contractor@housemind.com", "contractor"),
        ("homeowner@housemind.com",  "homeowner"),
    ]:
        await session.execute(text("""
            INSERT INTO invite_requests (
                id, project_id, invited_by, invitee_email, invitee_role,
                status, expires_at
            )
            VALUES (
                gen_random_uuid(), :project_id, :architect_id, :email, :role,
                'accepted', NOW() + INTERVAL '72 hours'
            )
            ON CONFLICT DO NOTHING
        """), {
            "project_id": PROJECT_ID,
            "architect_id": ARCHITECT_ID,
            "email": email,
            "role": role,
        })
    print("  ✓ Invite records seeded")

    # ── Project members (SEC-04: required for require_project_member checks) ──────
    await session.execute(text("""
        INSERT INTO project_members (id, project_id, user_id, role, joined_at)
        VALUES
        (gen_random_uuid(), :project_id, :architect_id,  'architect',  NOW()),
        (gen_random_uuid(), :project_id, :contractor_id, 'contractor', NOW()),
        (gen_random_uuid(), :project_id, :homeowner_id,  'homeowner',  NOW()),
        (gen_random_uuid(), :project_id, :supplier_id,   'supplier',   NOW())
        ON CONFLICT ON CONSTRAINT uq_project_members_project_user DO NOTHING
    """), {
        "project_id": PROJECT_ID,
        "architect_id": ARCHITECT_ID,
        "contractor_id": CONTRACTOR_ID,
        "homeowner_id": HOMEOWNER_ID,
        "supplier_id": SUPPLIER_ID,
    })
    print("  ✓ Project members seeded")

    await session.commit()

    print()
    print("─────────────────────────────────────────")
    print("Seed complete. Fixed IDs for Playwright / CI:")
    print(f"  TEST_PROJECT_ID  = {PROJECT_ID}")
    print(f"  TEST_IMAGE_ID    = {IMAGE_ID}")
    print(f"  TEST_PRODUCT_ID  = {PRODUCT_ID}")
    print("─────────────────────────────────────────")


async def main() -> None:
    engine = create_async_engine(DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())