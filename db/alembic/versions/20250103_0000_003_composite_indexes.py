"""Add composite indexes for production query patterns.

Revision ID: 003_composite_indexes
Revises: 002_products_and_resolve
Create Date: 2025-01-03 00:00:00.000000

Adds indexes identified from the four most common query patterns:

1. Annotation list per image (hottest path — every workspace page load):
   SELECT * FROM annotations WHERE image_id = $1 AND deleted_at IS NULL
   → Partial composite index: (image_id) WHERE deleted_at IS NULL
     (smaller than full composite, only covers active rows)

2. Project dashboard per architect:
   SELECT * FROM projects WHERE architect_id = $1 AND status != 'archived'
   → Already covered by ix_projects_architect_id_status from migration 001

3. Invite lookup by token (auth critical path):
   SELECT * FROM invite_requests WHERE magic_link_token = $1 AND status = 'pending'
   → Already covered by partial index from migration 001

4. Product by supplier (supplier's product catalogue):
   SELECT * FROM products WHERE supplier_id = $1
   → Already covered by ix_products_supplier_id from migration 002

5. Annotations by resolved state (QA / progress view):
   SELECT * FROM annotations WHERE image_id = $1 AND resolved_at IS NOT NULL
   → Partial index: (image_id, resolved_at) WHERE resolved_at IS NOT NULL
     (supplements the existing ix_annotations_resolved_at)

6. Project images ordered display (workspace image list):
   SELECT * FROM project_images WHERE project_id = $1 AND deleted_at IS NULL
   ORDER BY display_order, created_at
   → Partial composite: (project_id, display_order, created_at) WHERE deleted_at IS NULL
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "003_composite_indexes"
down_revision: Union[str, None] = "002_products_and_resolve"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Active annotations per image (hottest read path) ──────────────────
    # Replaces the plain ix_annotations_image_id for the soft-delete filter case.
    # Partial index only indexes non-deleted rows — much smaller, faster lookups.
    op.execute("""
        CREATE INDEX IF NOT EXISTS
        ix_annotations_image_id_active
        ON annotations (image_id, created_at)
        WHERE deleted_at IS NULL
    """)

    # ── 2. Resolved annotations per image (resolve view / progress dashboard) ─
    op.execute("""
        CREATE INDEX IF NOT EXISTS
        ix_annotations_image_id_resolved
        ON annotations (image_id, resolved_at)
        WHERE resolved_at IS NOT NULL AND deleted_at IS NULL
    """)

    # ── 3. Active images per project ordered for display ─────────────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS
        ix_project_images_project_display
        ON project_images (project_id, display_order, created_at)
        WHERE deleted_at IS NULL
    """)

    # ── 4. User email lookup (login / invite dedup) ───────────────────────────
    # ix_users_email already exists as UNIQUE — no new index needed.
    # Confirm with EXPLAIN: SELECT id FROM users WHERE email = $1 uses the unique index.

    # ── 5. Annotations by creator (audit trail / "my annotations" view) ──────
    op.execute("""
        CREATE INDEX IF NOT EXISTS
        ix_annotations_created_by_active
        ON annotations (created_by, created_at)
        WHERE deleted_at IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_annotations_image_id_active")
    op.execute("DROP INDEX IF EXISTS ix_annotations_image_id_resolved")
    op.execute("DROP INDEX IF EXISTS ix_project_images_project_display")
    op.execute("DROP INDEX IF EXISTS ix_annotations_created_by_active")
