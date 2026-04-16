"""Initial schema: users, projects, project_images, annotations, invite_requests.

Includes:
  - All tables with full column definitions
  - position_x / position_y FLOAT with CHECK constraints [0.0, 1.0]
  - deleted_at TIMESTAMPTZ soft-delete on annotations + project_images
  - All indexes: project_id, image_id, linked_product_id, magic_link_token
  - Composite index: projects(architect_id, status)
  - Partial index:   invite_requests(magic_link_token) WHERE status = 'pending'
  - Pre-merge constraint validation in upgrade()

Revision ID: 001_initial_schema
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Enum type names — defined once, referenced by columns
# ---------------------------------------------------------------------------
USER_ROLE_ENUM    = sa.Enum("architect", "contractor", "homeowner", "supplier",
                             name="user_role")
PROJECT_STATUS_ENUM = sa.Enum("draft", "active", "completed", "archived",
                               name="project_status")
INVITE_STATUS_ENUM  = sa.Enum("pending", "accepted", "expired", "revoked",
                               name="invite_status")


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. ENUM TYPES
    # -----------------------------------------------------------------------
    USER_ROLE_ENUM.create(op.get_bind(), checkfirst=True)
    PROJECT_STATUS_ENUM.create(op.get_bind(), checkfirst=True)
    INVITE_STATUS_ENUM.create(op.get_bind(), checkfirst=True)

    # -----------------------------------------------------------------------
    # 2. USERS
    # -----------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id",                 sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("email",              sa.String(320),  nullable=False),
        sa.Column("full_name",          sa.String(255),  nullable=False),
        sa.Column("role",               USER_ROLE_ENUM,  nullable=False),
        sa.Column("preferred_language", sa.String(5),    nullable=False,
                  server_default="th"),
        sa.Column("is_active",          sa.Boolean(),    nullable=False,
                  server_default=sa.text("true")),
        sa.Column("created_at",         sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",         sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    # email lookup (auth critical path)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # -----------------------------------------------------------------------
    # 3. PROJECTS
    # -----------------------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id",           sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("architect_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name",         sa.String(255),  nullable=False),
        sa.Column("description",  sa.Text(),       nullable=True),
        sa.Column("status",       PROJECT_STATUS_ENUM, nullable=False,
                  server_default="draft"),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",   sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    # Single-column indexes for individual filters
    op.create_index("ix_projects_architect_id", "projects", ["architect_id"])
    op.create_index("ix_projects_status",       "projects", ["status"])

    # COMPOSITE INDEX — architect dashboard query: filter by owner then status
    # e.g. SELECT * FROM projects WHERE architect_id = $1 AND status = 'active'
    op.create_index(
        "ix_projects_architect_id_status",
        "projects",
        ["architect_id", "status"],
    )

    # -----------------------------------------------------------------------
    # 4. PROJECT_IMAGES  (soft-delete: deleted_at)
    # -----------------------------------------------------------------------
    op.create_table(
        "project_images",
        sa.Column("id",                sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id",        sa.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("s3_key",            sa.String(1024), nullable=False),
        sa.Column("s3_bucket",         sa.String(255),  nullable=False),
        sa.Column("original_filename", sa.String(512),  nullable=True),
        sa.Column("mime_type",         sa.String(128),  nullable=False),
        sa.Column("width_px",          sa.Integer(),    nullable=True),
        sa.Column("height_px",         sa.Integer(),    nullable=True),
        sa.Column("display_order",     sa.Integer(),    nullable=False,
                  server_default=sa.text("0")),
        sa.Column("created_at",        sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        # SOFT-DELETE column — DEFAULT NULL means "not deleted"
        sa.Column("deleted_at",        sa.DateTime(timezone=True),
                  nullable=True, server_default=sa.text("NULL")),
    )
    op.create_index("ix_project_images_project_id", "project_images", ["project_id"])

    # -----------------------------------------------------------------------
    # 5. ANNOTATIONS  (position_x/y float + CHECK + soft-delete)
    # -----------------------------------------------------------------------
    op.create_table(
        "annotations",
        sa.Column("id",                sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("image_id",          sa.UUID(as_uuid=True),
                  sa.ForeignKey("project_images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by",        sa.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("linked_product_id", sa.UUID(as_uuid=True), nullable=True),

        # ------------------------------------------------------------------
        # Normalised float coordinates — range [0.0, 1.0]
        # CHECK constraints are the last line of defence; backend also validates.
        # DO NOT change to pixels or integers — frontend + backend agreed.
        # ------------------------------------------------------------------
        sa.Column("position_x",        sa.Float(), nullable=False),
        sa.Column("position_y",        sa.Float(), nullable=False),

        sa.Column("label",             sa.String(512), nullable=True),
        sa.Column("note",              sa.Text(),      nullable=True),
        sa.Column("created_at",        sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",        sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),

        # SOFT-DELETE column
        sa.Column("deleted_at",        sa.DateTime(timezone=True),
                  nullable=True, server_default=sa.text("NULL")),

        # CHECK constraints on coordinate range
        sa.CheckConstraint(
            "position_x BETWEEN 0.0 AND 1.0",
            name="ck_annotations_position_x_range",
        ),
        sa.CheckConstraint(
            "position_y BETWEEN 0.0 AND 1.0",
            name="ck_annotations_position_y_range",
        ),
    )
    op.create_index("ix_annotations_image_id",          "annotations", ["image_id"])
    op.create_index("ix_annotations_created_by",        "annotations", ["created_by"])
    op.create_index("ix_annotations_linked_product_id", "annotations", ["linked_product_id"])

    # -----------------------------------------------------------------------
    # 6. INVITE_REQUESTS
    # -----------------------------------------------------------------------
    op.create_table(
        "invite_requests",
        sa.Column("id",               sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id",       sa.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by",       sa.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invitee_email",    sa.String(320), nullable=False),
        sa.Column("invitee_role",     sa.String(50),  nullable=False),
        sa.Column("magic_link_token", sa.String(512), nullable=True),
        sa.Column("status",           INVITE_STATUS_ENUM, nullable=False,
                  server_default="pending"),
        sa.Column("expires_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_invite_requests_project_id",    "invite_requests", ["project_id"])
    op.create_index("ix_invite_requests_status",        "invite_requests", ["status"])

    # PARTIAL INDEX — magic_link_token lookups only matter for pending invites.
    # This keeps the index tiny and fast; accepted/expired/revoked rows are excluded.
    op.execute(
        """
        CREATE INDEX ix_invite_requests_magic_link_token_pending
        ON invite_requests (magic_link_token)
        WHERE status = 'pending'
        """
    )

    # -----------------------------------------------------------------------
    # 7. PRE-MERGE CONSTRAINT VALIDATION
    # Verify CHECK constraints work correctly before this migration ships.
    # Rolls back automatically on failure (transaction_per_migration=True in env.py).
    # -----------------------------------------------------------------------
    _validate_constraints(op.get_bind())


def _validate_constraints(conn: sa.engine.Connection) -> None:
    """
    Insert boundary-value rows to confirm CHECK constraints fire.
    All inserts are wrapped in a SAVEPOINT so they roll back cleanly —
    the test leaves no data behind.
    """
    from sqlalchemy import text

    # --- seed a minimal user for FK references ---
    conn.execute(text("""
        INSERT INTO users (id, email, full_name, role)
        VALUES (
            '00000000-0000-0000-0000-000000000001',
            'test@housemind.internal',
            'Migration Test User',
            'architect'
        )
        ON CONFLICT DO NOTHING
    """))

    conn.execute(text("""
        INSERT INTO projects (id, architect_id, name, status)
        VALUES (
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000001',
            'Migration Test Project',
            'draft'
        )
        ON CONFLICT DO NOTHING
    """))

    conn.execute(text("""
        INSERT INTO project_images (id, project_id, s3_key, s3_bucket, mime_type)
        VALUES (
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000002',
            'test/image.jpg',
            'housemind-test',
            'image/jpeg'
        )
        ON CONFLICT DO NOTHING
    """))

    # VALID boundary values — should succeed
    for x, y in [(0.0, 0.0), (1.0, 1.0), (0.5, 0.5)]:
        conn.execute(text("""
            INSERT INTO annotations
                (id, image_id, position_x, position_y)
            VALUES
                (gen_random_uuid(),
                 '00000000-0000-0000-0000-000000000003',
                 :x, :y)
        """), {"x": x, "y": y})

    # INVALID values — each must raise IntegrityError / CHECK violation
    import sqlalchemy.exc

    for bad_x, bad_y, label in [
        (-0.001, 0.5,  "position_x below 0"),
        (1.001,  0.5,  "position_x above 1"),
        (0.5,   -0.001, "position_y below 0"),
        (0.5,    1.001, "position_y above 1"),
    ]:
        sp = conn.begin_nested()
        try:
            conn.execute(text("""
                INSERT INTO annotations
                    (id, image_id, position_x, position_y)
                VALUES
                    (gen_random_uuid(),
                     '00000000-0000-0000-0000-000000000003',
                     :x, :y)
            """), {"x": bad_x, "y": bad_y})
            sp.rollback()
            raise AssertionError(
                f"CHECK constraint did NOT fire for: {label} "
                f"(position_x={bad_x}, position_y={bad_y}). "
                "Migration aborted — fix constraint definition."
            )
        except sqlalchemy.exc.IntegrityError:
            sp.rollback()  # Expected — constraint is working correctly

    # Clean up seeded rows
    conn.execute(text(
        "DELETE FROM annotations WHERE image_id = '00000000-0000-0000-0000-000000000003'"
    ))
    conn.execute(text("DELETE FROM project_images WHERE id = '00000000-0000-0000-0000-000000000003'"))
    conn.execute(text("DELETE FROM projects WHERE id = '00000000-0000-0000-0000-000000000002'"))
    conn.execute(text("DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001'"))


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.execute("DROP INDEX IF EXISTS ix_invite_requests_magic_link_token_pending")
    op.drop_table("invite_requests")
    op.drop_table("annotations")
    op.drop_table("project_images")
    op.drop_table("projects")
    op.drop_table("users")

    # Drop enum types
    INVITE_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
    PROJECT_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
    USER_ROLE_ENUM.drop(op.get_bind(), checkfirst=True)
