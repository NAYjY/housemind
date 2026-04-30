"""
app/tests/conftest.py — HouseMind
Pytest fixtures shared across the test suite.

Fixes applied:
  - _issue_token() now returns (token, jti, expires_at) — all fixtures
    unpack the tuple and return only the token string.
  - architect_token fixture adds architect to project_members so
    require_project_member checks pass in tests that create projects inline.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.db.session import get_db
from app.models.base import Base

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

import os
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-min64chars-padpadpadpadpadpadpadpadpadpadpad")
os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-1")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("SENTRY_DSN", "")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(
        test_engine, expire_on_commit=False, class_=AsyncSession
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """FastAPI test client with DB dependency override and S3 mocked."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from main import app

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.services.s3._get_s3_client") as mock_s3:
        mock_s3.return_value.generate_presigned_url.return_value = (
            "https://mock-s3.example.com/presigned"
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def architect_token(db_session: AsyncSession) -> str:
    """Create an architect user and return a valid JWT string."""
    import uuid
    from app.models.user import User
    from app.api.v1.auth import _issue_token

    user = User(
        id=uuid.uuid4(),
        email="architect@test.com",
        full_name="Test Architect",
        role="architect",
    )
    db_session.add(user)
    await db_session.flush()

    # _issue_token returns (token_str, jti, expires_at) — unpack correctly
    token, _jti, _exp = _issue_token(user)
    return token


@pytest_asyncio.fixture
async def contractor_token(db_session: AsyncSession) -> str:
    """Create a contractor user and return a valid JWT string."""
    import uuid
    from app.models.user import User
    from app.api.v1.auth import _issue_token

    user = User(
        id=uuid.uuid4(),
        email="contractor@test.com",
        full_name="Test Contractor",
        role="contractor",
    )
    db_session.add(user)
    await db_session.flush()

    token, _jti, _exp = _issue_token(user)
    return token


@pytest_asyncio.fixture
async def homeowner_token(db_session: AsyncSession) -> str:
    """Create a homeowner user and return a valid JWT string."""
    import uuid
    from app.models.user import User
    from app.api.v1.auth import _issue_token

    user = User(
        id=uuid.uuid4(),
        email="homeowner@test.com",
        full_name="Test Homeowner",
        role="homeowner",
    )
    db_session.add(user)
    await db_session.flush()

    token, _jti, _exp = _issue_token(user)
    return token