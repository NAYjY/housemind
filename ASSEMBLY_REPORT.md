# HouseMind — Assembly Agent Report

---

## Step 1 — Canonical File Tree

```
housemind/
├── .env.example                          ← Backend env template (DevOps)
├── .gitignore                            ← Secrets + build artifacts excluded (DevOps)
├── nixpacks.toml                         ← Railway build config (Database/DevOps)
├── railway.json                          ← Railway deploy config (Database/DevOps)
├── README.md                             ← Integration guide (Assembly Agent ← this run)
│
├── .github/
│   └── workflows/
│       └── backend.yml                   ← CI: lint + test + Railway deploy (DevOps)
│
├── frontend/                             ← Next.js app (Vercel)
│   ├── vercel.json                       ← Vercel config, rewrites, headers (DevOps)
│   ├── .env.local.example                ← Frontend env template (DevOps)
│   ├── app/
│   │   ├── layout.tsx                    ← Root layout + <Providers> (Frontend)
│   │   ├── providers.tsx                 ← QueryClientProvider (Frontend)
│   │   ├── globals.css                   ← CSS design tokens [NOT DELIVERED — see gaps]
│   │   └── workspace/
│   │       └── [projectId]/
│   │           └── [imageId]/
│   │               └── page.tsx          ← Route: /workspace/:projectId/:imageId (Frontend)
│   ├── components/
│   │   ├── annotation/
│   │   │   ├── AnnotationWorkspace.tsx   ← Top-level workspace (Frontend)
│   │   │   ├── AnnotationCanvas.tsx      ← Image + pins + touch (Frontend)
│   │   │   ├── AnnotationPin.tsx         ← Single pin at normalized x/y (Frontend)
│   │   │   └── ProductDetailPanel.tsx    ← Lazy detail + list (Frontend)
│   │   └── layout/
│   │       └── BottomSheet.tsx           ← Draggable bottom sheet, mobile (Frontend)
│   ├── hooks/
│   │   ├── useAnnotations.ts             ← React Query: fetch/create/delete (Frontend)
│   │   └── useTouchInteractions.ts       ← Tap / long-press gestures (Frontend)
│   ├── store/
│   │   └── annotationStore.ts            ← Zustand: annotations, activePinId, cache (Frontend)
│   ├── lib/
│   │   └── queryClient.ts                ← React Query config, staleTime 5min (Frontend)
│   └── public/
│       └── placeholder-room.jpg          ← Dev placeholder [NOT DELIVERED — see gaps]
│
├── backend/                              ← FastAPI app (Railway)
│   ├── main.py                           ← App factory, CORS, health endpoints (DevOps)
│   ├── app/
│   │   ├── core/
│   │   │   └── sentry.py                 ← Sentry init (DevOps)
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── annotations.py        ← Annotation CRUD router [NOT DELIVERED — see gaps]
│   │   │       ├── images.py             ← S3 URL refresh router [NOT DELIVERED — see gaps]
│   │   │       └── products.py           ← Product detail router [NOT DELIVERED — see gaps]
│   │   ├── models/
│   │   │   ├── base.py                   ← SQLAlchemy Base [NOT DELIVERED — see gaps]
│   │   │   ├── annotation.py             ← Annotation model (Database)
│   │   │   └── project_image.py          ← ProjectImage model (Database)
│   │   ├── schemas/
│   │   │   └── annotation.py             ← Pydantic schemas [NOT DELIVERED — see gaps]
│   │   ├── services/
│   │   │   └── s3.py                     ← Pre-signed URL service [NOT DELIVERED — see gaps]
│   │   ├── db/
│   │   │   ├── queries.py                ← Soft-delete query helpers (Database)
│   │   │   └── session.py                ← AsyncSession factory [NOT DELIVERED — see gaps]
│   │   ├── auth.py                       ← JWT middleware + role guards [NOT DELIVERED — see gaps]
│   │   └── config.py                     ← Pydantic Settings [NOT DELIVERED — see gaps]
│   └── tests/                            ← Backend unit/integration tests [NOT DELIVERED]
│
├── db/                                   ← Database migrations + models
│   └── alembic/
│       ├── env.py                        ← Alembic async env, Railway URL normalise (Database)
│       └── versions/
│           └── 20250101_0000_001_initial_schema.py  ← Full schema migration (Database)
│
├── qa/
│   └── housemind-qa-command-center.html  ← Device matrix, perf criteria, release gate (QA)
│
└── infra/
    ├── env-vars-reference.toml           ← Full env var documentation (DevOps)
    └── uptimerobot/
        ├── bootstrap.sh                  ← UptimeRobot monitor creation (DevOps)
        └── monitors.yml                  ← Monitor definitions (DevOps)
```

---

## Step 2 — Interface Contract Review

### 2a. Frontend API calls ↔ Backend route paths

| What Frontend calls | Frontend URL | Backend route defined | Status |
|---|---|---|---|
| Get annotations | `GET /api/images/:imageId/annotations` | `GET /api/v1/annotations?image_id=...` | ❌ **MISMATCH** |
| Create annotation | `POST /api/images/:imageId/annotations` | Not explicitly shown in router | ❌ **MISMATCH** |
| Delete annotation | `DELETE /api/images/:imageId/annotations/:id` | Not explicitly shown in router | ❌ **MISMATCH** |
| Get product detail | `GET /api/products/:productId` | `GET /api/v1/products/{product_id}` | ❌ **MISMATCH** (path prefix) |
| API base var name | `NEXT_PUBLIC_API_URL` | — | ❌ **MISMATCH** (DevOps calls it `NEXT_PUBLIC_API_BASE_URL`) |

**CONFLICT 1 — Annotation list endpoint path:**
- Frontend calls: `GET /api/images/{imageId}/annotations` (path param)
- Backend defines: `GET /api/v1/annotations?image_id=...` (query param)
- **Authoritative:** Backend (REST convention, easier pagination). Frontend must change to:
  `GET /api/v1/annotations?image_id={imageId}`
- Also: frontend uses `/api/images/` prefix; Vercel rewrites `/api/v1/*` → Railway. The frontend calls `/api/images/` which does NOT match the rewrite rule `/api/v1/:path*`. Frontend base path must be `/api/v1/`.

**CONFLICT 2 — Create/Delete annotation paths:**
- Frontend calls `POST /api/images/:imageId/annotations` and `DELETE /api/images/:imageId/annotations/:id`
- Backend shows create/delete as `POST /annotations` and `DELETE /annotations/{annotation_id}` under `/api/v1` prefix
- **Authoritative:** Backend. Frontend mutation URLs must be updated to:
  - Create: `POST /api/v1/annotations` with `image_id` in body
  - Delete: `DELETE /api/v1/annotations/{annotationId}`

**CONFLICT 3 — API base URL env var name:**
- Frontend `useAnnotations.ts` reads `process.env.NEXT_PUBLIC_API_URL`
- DevOps `env-vars-reference.toml` and `.env.example` define `NEXT_PUBLIC_API_BASE_URL`
- **Authoritative:** DevOps (canonical reference). Frontend must change to `NEXT_PUBLIC_API_BASE_URL`.

### 2b. Backend Pydantic models ↔ Database SQLAlchemy column names

| Pydantic field | Backend schema | DB model column | Status |
|---|---|---|---|
| Primary key | `annotation_id` (AnnotationSummary) | `id` (Annotation model) | ❌ **MISMATCH** |
| Product FK | `product_id` | `linked_product_id` | ❌ **MISMATCH** |
| Position X | `position_x` | `position_x` | ✅ |
| Position Y | `position_y` | `position_y` | ✅ |
| Soft delete | `deleted_at` (String!) | `deleted_at` (DateTime) | ❌ **TYPE MISMATCH** |
| Product PK | `product_id` | No `products` table in DB migration | ⚠️ **MISSING TABLE** |

**CONFLICT 4 — Annotation primary key name:**
- Backend `AnnotationSummary` uses `annotation_id`
- Database `Annotation` model uses `id`
- **Authoritative:** Database (already deployed pattern with `id`). Backend schema must change `annotation_id` to `id`.

**CONFLICT 5 — Product FK column name:**
- Backend `Annotation` SQLAlchemy model defines `product_id = Column(UUID, ForeignKey("products.product_id"))`
- Database `Annotation` model defines `linked_product_id` (nullable, no FK constraint defined yet)
- **Authoritative:** Database. Backend model must rename `product_id` to `linked_product_id`. Note: the DB migration has no `products` table — this is a blocking gap (see Step 3).

**CONFLICT 6 — deleted_at column type:**
- Backend `Annotation` model (in backend-agent-output.md): `deleted_at = Column(String, nullable=True)  # TIMESTAMPTZ — soft delete`
- Database `Annotation` model: `deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), ...)`
- **Authoritative:** Database (DateTime is correct). Backend model must change to `Column(DateTime(timezone=True), nullable=True)`.

**CONFLICT 7 — Project table primary key:**
- Backend `auth.py` queries `Project.project_id` and `Project.architect_id`
- Database migration creates `projects` table with columns `id` (not `project_id`) and `architect_id`
- **Authoritative:** Database. Backend `auth.py` `require_project_owner` must reference `Project.id`, not `Project.project_id`.

### 2c. Backend S3 helpers ↔ DevOps bucket/region config

| Backend config key | DevOps env var | Status |
|---|---|---|
| `settings.S3_BUCKET_PRODUCTS` | Not in DevOps `.env.example` | ❌ **MISMATCH** |
| `settings.S3_BUCKET_PROJECTS` | Not in DevOps `.env.example` | ❌ **MISMATCH** |
| `settings.AWS_REGION` | `AWS_DEFAULT_REGION` (DevOps) | ❌ **NAME MISMATCH** |

**CONFLICT 8 — S3 env var names:**
- Backend `config.py` reads `AWS_REGION`, `S3_BUCKET_PRODUCTS`, `S3_BUCKET_PROJECTS`
- DevOps defines `AWS_DEFAULT_REGION` (standard AWS SDK name) and `S3_BUCKET_NAME` (single bucket)
- **Resolution:** DevOps is authoritative on naming convention. Backend config must change:
  - `AWS_REGION` → `AWS_DEFAULT_REGION`
  - `S3_BUCKET_PRODUCTS` and `S3_BUCKET_PROJECTS` need to be added to DevOps env reference, OR the backend must consolidate to a single `S3_BUCKET_NAME` and use a key prefix strategy. This architectural decision must be made before shipping.

### 2d. Frontend auth cookie ↔ Backend JWT field names

| Item | Frontend assumption | Backend JWT field | Status |
|---|---|---|---|
| Token storage | Not implemented (FLAG-2) | Bearer header | ❌ **NOT WIRED** |
| User identifier | Not consumed | `user_id` (configurable via `JWT_USER_ID_FIELD`) | ⚠️ Open |
| Role field | Not consumed | `role` | N/A — not yet read by frontend |
| Expiry | Not consumed | `exp` (standard JWT) | N/A |

No contradiction, but the frontend has **zero auth header wiring**. All API calls in `useAnnotations.ts` have no `Authorization` header. This is not a contract mismatch but an implementation gap that blocks all protected endpoints.

### 2e. DevOps env vars ↔ vars actually used in code

| Var used in code | In `.env.example` | In `env-vars-reference.toml` | Status |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ |
| `SECRET_KEY` | ✅ | ✅ (as `SECRET_KEY`) | ✅ |
| `JWT_SECRET` (backend config.py) | ❌ | — | ❌ **MISMATCH** — backend reads `JWT_SECRET`, DevOps exports `SECRET_KEY` |
| `JWT_USER_ID_FIELD` | ❌ | ❌ | ❌ Missing |
| `AWS_ACCESS_KEY_ID` | ✅ | ✅ | ✅ |
| `AWS_SECRET_ACCESS_KEY` | ✅ | ✅ | ✅ |
| `AWS_DEFAULT_REGION` | ✅ | ✅ | ✅ (but backend uses `AWS_REGION`) |
| `S3_BUCKET_NAME` | ✅ | ✅ | ⚠️ Backend uses `S3_BUCKET_PRODUCTS` + `S3_BUCKET_PROJECTS` |
| `SENTRY_DSN` | ✅ | ✅ | ✅ |
| `CORS_ORIGINS` | ✅ | ✅ | ✅ |
| `ENVIRONMENT` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_API_URL` (frontend code) | ❌ | ❌ (`NEXT_PUBLIC_API_BASE_URL` is defined) | ❌ **MISMATCH** |
| `NEXT_PUBLIC_API_BASE_URL` | ❌ in `.env.local.example` | ✅ in reference | ⚠️ Not in `.env.local.example` |

**CONFLICT 9 — JWT secret key name:**
- Backend `config.py` reads `JWT_SECRET`
- DevOps `.env.example` and reference define `SECRET_KEY`
- **Authoritative:** DevOps (manages all env vars). Backend `config.py` must rename `JWT_SECRET` → `SECRET_KEY`.

---

## Step 3 — Critical Gap Review

### AUTH

- **[ ] Invite token generation endpoint** — ❌ **MISSING.** No `POST /auth/magic-link` or `POST /invite-requests` route file was delivered by the Backend agent. The Backend agent flagged this (`⚠ MAGIC LINK ROUTES`). The Database migration includes the `invite_requests` table with `magic_link_token` and `status` columns, but no backend route exists to generate or consume tokens. The QA release gate requires "Magic link auth — all 4 roles" to pass. **This is a blocking gap.**

- **[ ] JWT middleware applied to all protected routes** — ⚠️ **PARTIAL.** `auth.py` exists and defines `require_project_member` and `require_architect` guards. The annotation read routes use `require_project_member`. However, the actual FastAPI router files (`annotations.py`, `images.py`, `products.py`) were not delivered as code files — only described in the Backend markdown. Cannot confirm middleware is wired on all routes without the actual router files. **Must be verified when backend code files are delivered.**

- **[ ] Role claim enforced before mutations** — ⚠️ **PARTIAL.** `auth.py` defines `require_project_owner` (architect + project ownership) for writes, and `require_project_member` for reads. The Backend output shows write routes using `require_project_owner`. However, `require_architect` alone is NOT sufficient for the annotation resolve/reopen requirement (Architect + Contractor per spec). The current RBAC only gates on `architect` role for all writes — **Contractor cannot resolve/reopen even though the spec requires it.** Blocking gap for annotation thread management.

### ANNOTATION WORKSPACE

- **[✅] Pin placement uses x_pct / y_pct as percentage of image dimensions** — Confirmed across all three layers:
  - DB: `position_x FLOAT CHECK BETWEEN 0.0 AND 1.0`, `position_y FLOAT CHECK BETWEEN 0.0 AND 1.0`
  - Backend: `position_x: float`, `position_y: float` with same CHECK constraints
  - Frontend: `annotation.positionX * 100 + "%"` in `AnnotationPin.tsx`
  - ✅ No pixel math anywhere in the stack.

- **[ ] Concurrent annotation saves — optimistic lock or last-write-wins acknowledged** — ❌ **NOT ADDRESSED.** No version field, ETag, or `updated_at` comparison exists in the create/update flow. The Database `Annotation` model has `updated_at` but the backend does not use it for concurrency control. The Frontend `FLAG-4` flagged optimistic UI as deferred. **Must be explicitly documented as last-write-wins before shipping, or an optimistic lock (`version` column + 409 on conflict) must be added.** Currently an unacknowledged risk.

- **[ ] Annotation thread resolve/reopen is role-gated to Architect + Contractor** — ❌ **MISSING.** No `resolved_at` or `status` field exists on the `Annotation` model in the database, and no resolve/reopen endpoint was delivered. Neither the Database agent nor the Backend agent implemented this feature. This is a core product feature per spec. **Blocking gap.**

### MOBILE

- **[✅] Touch targets are min 44px on annotation canvas** — Confirmed. `AnnotationPin.tsx` renders pins at `44px × 44px` (inactive) and `52px × 52px` (active). `useTouchInteractions.ts` uses a 28px hit radius (Euclidean) which is appropriate.

- **[✅] Bottom-sheet panels do not use `position: fixed` for content** — Confirmed. `BottomSheet.tsx` uses `position: fixed` only for the sheet container itself (required for mobile overlay behavior) and a backdrop. The content area uses `flex: 1, overflowY: auto`. This is the correct implementation — the assembly agent confirms no issue here.

- **[ ] Thai font (Noto Sans Thai) in Next.js font config** — ❌ **MISSING.** `layout.tsx` does not include `next/font/google` with Noto Sans Thai. The Frontend agent flagged i18n as not implemented (`FLAG-5`). The `<html lang="en">` attribute is also hardcoded English. **Required before any Thai user testing.**

### DATA INTEGRITY

- **[✅] All PKs are UUIDs** — Confirmed in migration: `users.id`, `projects.id`, `project_images.id`, `annotations.id`, `invite_requests.id` are all `UUID(as_uuid=True)`. No serial integers.

- **[✅] Soft-delete pattern for projects** — ⚠️ **PARTIAL.** The `projects` table has a `status` enum (`draft / active / completed / archived`) which serves as soft-delete equivalent. However, there is no `deleted_at` column on `projects` — only on `annotations` and `project_images`. The `db/queries.py` helpers do not include project soft-delete helpers. Confirm whether `status = 'archived'` is the intended project soft-delete mechanism; if so, document it explicitly and add a query helper.

- **[ ] S3 assets table record created after upload confirmed, not before** — ❌ **CANNOT VERIFY.** No upload endpoint was delivered by the Backend agent. The Backend markdown describes `generate_presigned_url` for GET (read), but no PUT presign + post-upload confirmation webhook was delivered. The `ProjectImage` table records would need to be created in a two-step flow (presign → client uploads → confirm). This flow is entirely absent. **Blocking gap for any image upload.**

### DEVOPS

- **[✅] Staging and production use separate env var sets** — Confirmed. `env-vars-reference.toml` documents separate Railway (backend) and Vercel (frontend) environments. `ENVIRONMENT` variable distinguishes `staging` / `production`. `vercel.json` deploys only from `main` branch.

- **[✅] No secrets committed — .env files are in .gitignore** — Confirmed. `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.staging`.

- **[✅] Railway healthcheck endpoint at /health** — Confirmed. `main.py` defines `GET /health` returning `{"status": "ok", "uptime_seconds": N, "environment": ..., "version": ...}`. Also defines `GET /health/ready` for deeper DB check. Backend CI workflow polls `$BACKEND_URL/health` after deploy.

### QA

- **[ ] Critical path Playwright test covers: invite link → workspace load → place annotation → reply → resolve** — ❌ **MISSING.** The QA delivery is a browser-rendered HTML Command Center dashboard covering device setup, performance criteria, bug triage, and release gate checklists. No Playwright `.spec.ts` file was delivered. No k6 load test script was delivered. The release gate references "Magic link auth — all 4 roles" and "Annotation persistence on reload" as gate criteria, but no automated test code exists to run in CI. **Blocking gap.**

- **[✅] Device matrix covers: Samsung Galaxy A13, iPhone SE 3rd gen, iPad Air** — Confirmed in the QA Command Center device matrix. Note: the QA agent uses "iPad 9th gen" not "iPad Air" as specified in the Assembly instructions, but these are both iPad-class devices. Confirm which model is intended with the QA agent.

---

## Step 4 — Integration README

See `README.md` in this repository root.

---

## Step 5 — Final Verdict

```
╔══════════════════════════════════════════════╗
║         NEEDS FIXES                          ║
╚══════════════════════════════════════════════╝
```

The following issues are blocking and must be resolved before this project can be deployed to staging.

---

### BLOCKING ISSUES

**[BLK-1] Backend router code files not delivered**
- Missing: `backend/app/api/v1/annotations.py`, `images.py`, `products.py`
- Missing: `backend/app/auth.py`, `backend/app/config.py`, `backend/app/schemas/annotation.py`, `backend/app/services/s3.py`, `backend/app/db/session.py`, `backend/app/models/base.py`
- The Backend agent delivered a markdown architecture document, not importable Python files. `main.py` has router registration commented out. Nothing runs.
- **Fix:** Backend agent must deliver all code files. `main.py` line `# from app.api.v1 import router as api_v1_router` and `# app.include_router(...)` must be uncommented after files are created.

**[BLK-2] Frontend API URLs do not match backend routes**
- `frontend/hooks/useAnnotations.ts`, lines 14, 30, 43, 52: All fetch URLs use `/api/images/:imageId/annotations` and `/api/products/:productId`
- Must change to: `GET /api/v1/annotations?image_id={imageId}`, `POST /api/v1/annotations`, `DELETE /api/v1/annotations/{id}`, `GET /api/v1/products/{productId}`
- **Fix:** Update all fetch URLs in `useAnnotations.ts`.

**[BLK-3] Frontend has no Authorization header on any API call**
- `frontend/hooks/useAnnotations.ts`: all `fetch()` calls have no `Authorization` header
- All backend routes require `require_project_member` which validates a Bearer token
- Every API call will return 401 until this is wired
- **Fix:** Add JWT token retrieval (from cookie or localStorage) and inject `Authorization: Bearer <token>` header. Frontend agent must confirm token storage mechanism with backend agent first (Backend FLAG-2).

**[BLK-4] NEXT_PUBLIC_API_URL env var mismatch**
- `frontend/hooks/useAnnotations.ts` line 3: `process.env.NEXT_PUBLIC_API_URL`
- DevOps defines: `NEXT_PUBLIC_API_BASE_URL`
- **Fix:** Change `useAnnotations.ts` line 3 to `process.env.NEXT_PUBLIC_API_BASE_URL ?? ""`.

**[BLK-5] JWT secret env var name mismatch**
- Backend `config.py` (described in Backend markdown): reads `JWT_SECRET`
- DevOps `.env.example` and `env-vars-reference.toml`: defines `SECRET_KEY`
- **Fix:** Backend `config.py` field `JWT_SECRET: str` must be renamed to `SECRET_KEY: str`, OR DevOps must add `JWT_SECRET` to all env references.

**[BLK-6] AWS env var names inconsistent across backend and DevOps**
- Backend `config.py`: `AWS_REGION`, `S3_BUCKET_PRODUCTS`, `S3_BUCKET_PROJECTS`
- DevOps: `AWS_DEFAULT_REGION`, `S3_BUCKET_NAME`
- **Fix:** Align to DevOps naming (`AWS_DEFAULT_REGION`). For buckets, a decision is needed: single bucket with prefixes (simpler) or two separate buckets (more isolation). Update backend `config.py` and all env references together.

**[BLK-7] Backend Pydantic schema field names don't match DB column names**
- `AnnotationSummary.annotation_id` → must be `id` (DB column is `id`)
- `Annotation.product_id` (backend model) → must be `linked_product_id` (DB column)
- `Annotation.deleted_at` typed as `String` in backend → must be `DateTime(timezone=True)` (DB column)
- `auth.py` references `Project.project_id` → must be `Project.id`
- **Fix:** Update backend Pydantic schemas and SQLAlchemy model definitions to match DB migration column names.

**[BLK-8] No magic-link / invite token endpoint**
- No `POST /auth/magic-link` or `POST /invite-requests` endpoint delivered
- QA release gate requires magic link auth to pass for all 4 roles
- **Fix:** Backend agent must deliver invite token generation and consumption routes. These must be excluded from JWT middleware (Backend flagged this).

**[BLK-9] No image upload endpoint or post-upload confirmation flow**
- No `PUT` presign endpoint delivered; no `POST /images/confirm` endpoint delivered
- `ProjectImage` records can only be created manually; no upload flow exists
- **Fix:** Backend agent must deliver upload presign + confirm endpoint. S3 record must only be created after client confirms successful upload.

**[BLK-10] No Playwright test suite or k6 load script**
- QA delivered a browser-based HTML dashboard, not automated test files
- No `.spec.ts` files for the critical path: invite → workspace → annotate → resolve
- CI workflow (`backend.yml`) runs only Python tests; no Playwright runner configured
- **Fix:** QA agent must deliver `qa/tests/*.spec.ts` Playwright files and a `qa/load/k6.js` script. A frontend CI workflow (`frontend.yml`) running Playwright in CI is also needed.

**[BLK-11] No `products` table in database migration**
- Backend references a `products` table (`Product` model with `product_id`, `name`, `thumbnail_url`, etc.)
- Database migration `001_initial_schema.py` creates: `users`, `projects`, `project_images`, `annotations`, `invite_requests` — **no `products` table**
- The annotation `linked_product_id` column has no FK because the products table doesn't exist
- **Fix:** Database agent must deliver a `products` table migration. Backend `Annotation` model FK to `products.id` must be added.

**[BLK-12] Annotation resolve/reopen not implemented**
- No `resolved_at`, `resolved_by`, or `status` field on `Annotation` model
- No resolve/reopen endpoint exists
- Role gate for this operation (Architect + Contractor) is unimplemented
- **Fix:** Database agent must add `resolved_at TIMESTAMPTZ`, `resolved_by UUID FK(users.id)` to `annotations` table. Backend agent must deliver `PATCH /annotations/{id}/resolve` and `PATCH /annotations/{id}/reopen` endpoints with appropriate role gate.

**[BLK-13] Concurrent annotation saves not acknowledged**
- No optimistic lock, version field, or last-write-wins policy documented
- **Fix:** Engineering must explicitly document the concurrency policy (last-write-wins is acceptable if stated). If optimistic lock is required, add a `version INTEGER` column to `annotations` and return 409 on stale update.

**[BLK-14] Thai font (Noto Sans Thai) not configured**
- `frontend/app/layout.tsx` has no `next/font/google` import
- `<html lang="en">` is hardcoded
- **Fix:** Add to `layout.tsx`:
  ```tsx
  import { Noto_Sans_Thai } from "next/font/google";
  const notoSansThai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "700"] });
  ```
  Apply to `<body>` className. Change `<html lang="en">` to accept locale prop.

**[BLK-15] `globals.css` and `placeholder-room.jpg` not delivered**
- `layout.tsx` imports `"./globals.css"` — file not in frontend zip
- `page.tsx` falls back to `"/placeholder-room.jpg"` — file not in public zip
- Build will fail without `globals.css`. Dev experience breaks without placeholder image.
- **Fix:** Frontend agent must deliver `globals.css` with CSS custom properties (`:root` vars used by components: `--color-accent`, `--color-surface`, `--color-border`). Add a placeholder image to `public/`.

---

### NON-BLOCKING FLAGS (must be tracked, do not block staging deploy)

- **[P1]** `frontend/app/workspace/.../page.tsx` passes `imageUrl` from `searchParams.src` — no server-side validation or presigned URL refresh on 403. Wire `GET /api/v1/images/:id/url` refresh logic in `AnnotationWorkspace`.
- **[P1]** `AnnotationCanvas.tsx` fires `POST` with `productId: "pending"` — product picker modal not yet built. Flag to Product/UX.
- **[P2]** `BottomSheet.tsx` uses `position: fixed` for the sheet itself, which is correct. However, if any descendant uses `transform` (for animation), fixed positioning becomes relative to that ancestor. Confirm no transform ancestors in production layout.
- **[P2]** `Annotation` model `created_by` is `nullable=True` — ensure creation endpoint always sets this from JWT token, not null.
- **[P2]** `frontend/app/layout.tsx` hardcodes `lang="en"`. Change to dynamic locale.
- **[P2]** DevOps `backend.yml` CI uses `asyncpg` in production (`DATABASE_URL=postgresql+asyncpg://...`) but CI PostgreSQL service uses sync `postgresql://` URL. Alembic `env.py` normalises to `psycopg2` for migrations. Confirm test DB URL driver alignment.
- **[P3]** QA device matrix uses "iPad 9th gen" vs spec's "iPad Air" — clarify with QA agent.
- **[P3]** `queryClient.ts` sets `staleTime: 5min` globally. Backend specifies thumbnails should use `staleTime < 3,300,000ms` (55min) and project images `< 600,000ms` (10min). Per-query override needed in `useProductDetail` hook.
