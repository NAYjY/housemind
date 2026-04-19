# HouseMind

A collaborative annotation workspace where architects, contractors, homeowners, and suppliers make shared building decisions on project images. Annotation pins are placed at normalised (x, y) coordinates, linked to supplier product records, and role-gated at every layer.

**Stack:** Next.js 14 (Vercel) · FastAPI (Railway) · PostgreSQL 15 (Railway) · S3 ap-southeast-1 · JWT magic-link auth · Thai + English i18n

---

## Problem

🛠 Project Onboarding & Migration Error Report
1. PostgreSQL Enum Conflicts (Double-Creation)
The Problem: The backend would crash with sqlalchemy.exc.ProgrammingError: type "user_role" already exists.

The Cause: "Double ownership." Both the Alembic migration and the SQLAlchemy models were trying to create the same Enum types in the database.

The Fix: * Set create_type=False in the SQLAlchemy Enum definitions within the Python models.

Used postgresql.ENUM(name="...", create_type=False) inside the Alembic op.create_table commands to ensure it only references the existing type created at the top of the script.

2. Non-Transactional Index Errors
The Problem: Migration 003 failed with ActiveSQLTransactionError: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

The Cause: Postgres prevents "Concurrent" index building inside a standard BEGIN/COMMIT block because it requires two table scans. Alembic wraps all migrations in a transaction by default.

The Fix: Removed the CONCURRENTLY keyword from the migration. For local development with empty tables, the performance benefit is zero, and it allows the migration to run safely within the standard transaction.

3. FastAPI Route Validation (HTTP 204)
The Problem: Backend startup crashed with AssertionError: Status code 204 must not have a response body.

The Cause: The DELETE endpoint was set to status_code=204, but the function was returning data (the result of the delete logic). HTTP 204 is strictly "No Content."

The Fix: Modified the endpoint to return Response(status_code=status.HTTP_204_NO_CONTENT) or simply return None to ensure no body is sent.

4. Python Syntax Rules (__future__)
The Problem: SyntaxError: from __future__ imports must occur at the beginning of the file.

The Cause: In auth.py, code or stray characters (accidental pastes) were placed above the from __future__ import annotations line.

The Fix: Moved the __future__ import to the absolute first line of the file (line 1).

5. Makefile Environment Mismatch
The Problem: make db-migrate and make db-seed failed with Error 127: alembic/python not found.

The Cause: The Makefile was written to execute commands on the host machine, but the required tools were only installed inside the Docker containers.

The Fix: Commands must be executed via docker compose exec backend <command>.

Recommendation: Update the Makefile to wrap these commands in docker compose exec so they are portable for all developers.

6. Frontend Routing (404 on Root)
The Problem: Navigating to http://localhost:3000 returned a 404.

The Cause: The project used a nested dynamic directory structure (/workspace/[projectId]/[imageId]) but lacked a root page.tsx in the app/ directory.

The Fix: Created a basic app/page.tsx to serve as a landing page/entry point for the application.

🚀 Final System Status
Database: Schema version 003_composite_indexes is active.

Backend: Uvicorn is running, and Swagger documentation is available at /docs.

Frontend: Next.js is serving pages, and dynamic routing is functional.

Summary Note: The system is now stable. Future developers should ensure they have the postgresql.dialects import in their migrations and avoid running host-level Python commands if they are strictly using the Docker environment.
---
## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | `nvm install 20` |
| Python | 3.11 | `pyenv install 3.11` |
| PostgreSQL | 15 | Only needed without Docker |
| Docker Desktop | 4.x+ | For full local stack |
| k6 | latest | Load tests only — `brew install k6` |

---

## Quick Start (Docker — recommended)

```bash
git clone <repo-url> housemind && cd housemind

# Copy env templates
cp .env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# Start all services (postgres + localstack + backend + frontend)
make up
# or: docker compose up

# In a second terminal — run migrations and seed
make db-migrate   # alembic upgrade head
make db-seed      # inserts deterministic test data
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- LocalStack S3: http://localhost:4566

---

## Local Dev (without Docker)

```bash
# 1. Start only postgres + localstack
make up-db

# 2. Backend
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp ../.env.example .env   # edit to taste

# 3. Migrate + seed
alembic -c ../db/alembic.ini upgrade head
python ../db/seed.py

# 4. Run backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 5. Frontend (new terminal)
cd frontend
npm ci
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `ENVIRONMENT` | ✅ | `local` \| `staging` \| `production` |
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host:5432/db` |
| `SECRET_KEY` | ✅ | JWT signing key — min 64 random bytes, base64url. Generate: `openssl rand -base64 64` |
| `JWT_USER_ID_FIELD` | ❌ | `user_id` (default) or `email` — JWT claim used as user identifier |
| `AWS_ACCESS_KEY_ID` | ✅ | IAM key. Use `testing` with LocalStack. |
| `AWS_SECRET_ACCESS_KEY` | ✅ | IAM secret. Use `testing` with LocalStack. |
| `AWS_DEFAULT_REGION` | ✅ | `ap-southeast-1` (Thailand-adjacent) |
| `AWS_ENDPOINT_URL` | ❌ | LocalStack only: `http://localhost:4566`. Remove for real AWS. |
| `S3_BUCKET_NAME` | ✅ | Single bucket, prefix strategy. Local: `housemind-dev-bucket` |
| `RESEND_API_KEY` | ❌ | Magic-link email via Resend. Leave empty to log link to console. |
| `FRONTEND_URL` | ✅ | Base URL for magic-link emails. Local: `http://localhost:3000` |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins. Local: `http://localhost:3000` |
| `SENTRY_DSN` | ❌ | Backend Sentry DSN. Leave empty to disable. |
| `LOG_LEVEL` | ❌ | `DEBUG` \| `INFO` (default) \| `WARNING` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | Backend API base. Local: `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_APP_ENV` | ✅ | `local` \| `staging` \| `production` |
| `NEXT_PUBLIC_SENTRY_DSN` | ❌ | Frontend Sentry DSN (separate from backend). |

### GitHub Secrets (CI/CD)

| Secret | Description |
|---|---|
| `RAILWAY_TOKEN` | Railway API token → Project → Settings → Tokens |
| `RAILWAY_STAGING_SERVICE_NAME` | Railway service name (e.g. `housemind-api-staging`) |
| `STAGING_API_URL` | `https://api-staging.housemind.app` (no `/v1`) |
| `STAGING_FRONTEND_URL` | `https://staging.housemind.app` |
| `TEST_ARCHITECT_TOKEN` | Valid architect JWT for Playwright tests |
| `TEST_CONTRACTOR_TOKEN` | Valid contractor JWT |
| `TEST_HOMEOWNER_TOKEN` | Valid homeowner JWT |
| `TEST_SUPPLIER_TOKEN` | Valid supplier JWT |
| `TEST_PROJECT_ID` | UUID of seeded test project (from `make db-seed` output) |
| `TEST_IMAGE_ID` | UUID of seeded test image |

---

## How to Run Tests

### Backend unit tests

```bash
cd backend
source .venv/bin/activate
pytest app/tests/ -v --cov=app --cov-report=term-missing
# Coverage must be ≥ 70% (enforced in CI)
```

### Backend lint + type-check

```bash
cd backend
ruff check .
mypy app --ignore-missing-imports
```

### Playwright E2E (all suites)

```bash
# Against local dev stack
npx playwright test

# Specific suite
npx playwright test qa/tests/critical-path.spec.ts
npx playwright test qa/tests/accessibility.spec.ts
npx playwright test qa/tests/role-access.spec.ts
npx playwright test qa/tests/locale.spec.ts
npx playwright test qa/tests/performance.spec.ts

# Specific device
npx playwright test --project=samsung-a13

# Interactive UI mode
make playwright-ui
```

### Load test (k6)

```bash
k6 run qa/load/k6.js \
  -e API_BASE=https://api-staging.housemind.app/v1 \
  -e JWT_TOKEN=<architect_jwt> \
  -e IMAGE_ID=<test_image_id> \
  -e PRODUCT_ID=<test_product_id>
```

Thresholds: annotation list p95 < 500ms · product detail p95 < 500ms · error rate < 1%

---

## Project Structure

```
housemind/
├── .env.example                 Backend env template
├── .gitignore
├── docker-compose.yml           Full local dev stack
├── Makefile                     Common dev commands
├── playwright.config.ts         E2E test config (4 devices)
├── nixpacks.toml                Railway build config
├── railway.json                 Railway deploy config
│
├── .github/
│   ├── dependabot.yml           Automated dep updates (weekly)
│   └── workflows/
│       ├── backend.yml          Backend CI → Railway deploy
│       ├── frontend.yml         Frontend CI + Playwright + role-access
│       └── staging.yml          Manual staging deploy + smoke tests
│
├── frontend/                    Next.js 14 (Vercel)
│   ├── app/
│   │   ├── layout.tsx           Noto Sans Thai + Noto Sans fonts, lang="th"
│   │   ├── globals.css          CSS custom properties (design tokens)
│   │   ├── providers.tsx        QueryClientProvider + DevTools
│   │   ├── auth/
│   │   │   ├── expired/         Session expired page (bilingual)
│   │   │   └── redeem/          Magic-link token → JWT → redirect
│   │   └── workspace/
│   │       └── [projectId]/[imageId]/   Annotation workspace route
│   ├── components/annotation/
│   │   ├── AnnotationWorkspace  Role-aware, ARIA, data-testid
│   │   ├── AnnotationCanvas     Touch canvas, 44px hit targets
│   │   ├── AnnotationPin        Normalised position (x_pct, y_pct)
│   │   └── ProductDetailPanel   Resolve/reopen, skeleton, price fmt
│   ├── components/layout/
│   │   └── BottomSheet          Mobile draggable panel
│   ├── hooks/
│   │   ├── useAnnotations       React Query CRUD + resolve/reopen
│   │   ├── useAuth              Role-gating (canWrite, canResolve)
│   │   ├── useImageUrl          Presigned URL refresh on 403
│   │   └── useTouchInteractions Tap / long-press gestures
│   ├── lib/
│   │   ├── auth.ts              Token storage, authFetch, role guards
│   │   └── queryClient.ts       SSR-safe singleton, staleTime contract
│   ├── store/annotationStore    Zustand: annotations, activePinId, cache
│   ├── messages/{th,en}.json   i18n string catalogues
│   ├── middleware.ts            Edge: locale detection + auth guard
│   └── i18n/request.ts         next-intl server config
│
├── backend/                     FastAPI (Railway)
│   ├── main.py                  App factory, CORS, health, lifespan
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── annotations      CRUD + resolve/reopen
│   │   │   ├── auth             Magic-link invite + redemption
│   │   │   ├── images           URL refresh + upload presign + confirm
│   │   │   └── products         Lazy product detail
│   │   ├── auth.py              JWT decode, role guards
│   │   ├── config.py            Pydantic Settings (canonical env var names)
│   │   ├── core/
│   │   │   ├── exceptions       Global handlers → {detail, error_code}
│   │   │   ├── logging          structlog, RequestLoggingMiddleware, trace_id
│   │   │   └── sentry           Sentry init
│   │   ├── db/
│   │   │   ├── session          AsyncSession, pool_size=5+10, pool_pre_ping
│   │   │   └── queries          Soft-delete query helpers (NEVER bypass)
│   │   ├── models/              SQLAlchemy 2.0 mapped_column style
│   │   ├── schemas/             Pydantic v2 request/response schemas
│   │   ├── services/
│   │   │   ├── email            Resend magic-link dispatch, bilingual HTML
│   │   │   └── s3               Presign GET/PUT, single-bucket prefix strategy
│   │   └── tests/               pytest-asyncio, SQLite in-memory, moto S3
│
├── db/
│   ├── alembic.ini
│   ├── seed.py                  Deterministic seed with fixed UUIDs
│   └── alembic/versions/
│       ├── 001_initial_schema   users, projects, images, annotations, invites
│       ├── 002_products_and_resolve   products table + resolved_at/by
│       └── 003_composite_indexes      Partial indexes for hot query paths
│
├── qa/
│   ├── global-setup.ts          Health check + auto-mint role tokens
│   ├── tests/
│   │   ├── critical-path.spec   TC-CP-01→07: invite→workspace→annotate→resolve
│   │   ├── accessibility.spec   TC-A11Y-01→06: 44px targets, ARIA, color, alt
│   │   ├── locale.spec          TC-L01→07: Thai strings, font, price, overflow
│   │   ├── performance.spec     TC-PERF-01→06: LCP, CLS, API latency, panel open
│   │   └── role-access.spec     Full RBAC matrix: all 4 roles × all mutations
│   └── load/k6.js               Load test: 50-100 VU ramp, p95 < 500ms threshold
│
└── infra/
    ├── env-vars-reference.toml  Canonical env var documentation
    ├── localstack/init-s3.sh    Dev S3 bucket + CORS setup
    └── uptimerobot/             Production uptime monitors
```

---

## Roles

| Role | Create annotation | Resolve/Reopen | Delete | Create invite | Upload image |
|---|---|---|---|---|---|
| **Architect** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Contractor** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Homeowner** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Supplier** | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Deploy Checklist

### Staging

```
□ Push to main / release/* branch
□ GitHub Actions backend.yml passes (lint + tests + Railway deploy)
□ GET https://api-staging.housemind.app/health → {"status":"ok"}
□ GET https://api-staging.housemind.app/health/ready → {"status":"ok","checks":{"database":"ok"}}
□ Run: make db-seed (staging DB)
□ Run Playwright smoke: npx playwright test --project=samsung-a13 (set PLAYWRIGHT_BASE_URL)
□ QA sign-off: complete housemind-qa-command-center.html checklist
□ All Playwright suites green (critical-path, accessibility, role-access, locale)
```

### Production

```
□ Staging deploy complete + QA signed off
□ No open P0 issues in Linear
□ P1 mitigations documented and approved by PM
□ Production env vars set in Railway + Vercel dashboards (SEPARATE from staging)
□ Deploy (push tag or promote Railway service to production)
□ GET https://api.housemind.app/health → {"status":"ok"}
□ GET https://api.housemind.app/health/ready → {"status":"ok","checks":{"database":"ok"}}
□ Smoke test on Samsung Galaxy A13 physical device against production
□ QA apply qa-approved label in Linear
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Pin coordinates | `position_x/y` ∈ [0.0, 1.0] (normalised) | Resolution-independent, works on any screen size |
| Concurrency policy | Last-write-wins (explicitly documented) | Sufficient for MVP; `version` column can be added for optimistic lock later |
| Soft-delete | `deleted_at TIMESTAMPTZ` on annotations/images; `status=archived` on projects | Audit trail preserved; hard delete never exposed via API |
| S3 architecture | Single bucket, key prefix per asset type | Simpler IAM, one `S3_BUCKET_NAME` env var |
| DB record creation | Image record created ONLY after client confirms S3 upload | Prevents DB/S3 desync |
| Token storage | `localStorage["hm_token"]` | No CSRF risk (not a cookie); cleared on 401 |
| Font | Noto Sans Thai (primary) + Noto Sans Latin | Google Fonts, excellent Thai coverage, open license |
