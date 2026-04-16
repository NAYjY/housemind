# Makefile — HouseMind
# Common development workflows.
# Run from the project root: make <target>

.PHONY: help up down db-shell db-migrate db-seed db-reset \
        backend-shell backend-test backend-lint \
        frontend-install frontend-dev \
        playwright playwright-ui logs

# ── Docker Compose ────────────────────────────────────────────────────────────

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

up:             ## Start all services (postgres, localstack, backend, frontend)
	docker compose up

up-db:          ## Start only postgres + localstack (for local Python dev without Docker backend)
	docker compose up postgres localstack

down:           ## Stop all services
	docker compose down

down-v:         ## Stop all services and delete volumes (full reset)
	docker compose down -v

logs:           ## Tail logs for all services
	docker compose logs -f

# ── Database ──────────────────────────────────────────────────────────────────

db-shell:       ## Open psql in the running postgres container
	docker compose exec postgres psql -U housemind -d housemind_dev

db-migrate:     ## Run Alembic migrations against the local database
	cd backend && alembic -c ../db/alembic.ini upgrade head

db-seed:        ## Seed the local database with test data
	cd backend && python ../db/seed.py

db-reset:       ## Drop and recreate the local database, then migrate + seed
	docker compose exec postgres dropdb -U housemind housemind_dev --if-exists
	docker compose exec postgres createdb -U housemind housemind_dev
	$(MAKE) db-migrate
	$(MAKE) db-seed

# ── Backend ───────────────────────────────────────────────────────────────────

backend-shell:  ## Open a shell in the running backend container
	docker compose exec backend bash

backend-test:   ## Run backend tests with coverage
	cd backend && pytest app/tests/ -v --cov=app --cov-report=term-missing

backend-lint:   ## Run ruff + mypy
	cd backend && ruff check . && mypy app --ignore-missing-imports

# ── Frontend ──────────────────────────────────────────────────────────────────

frontend-install: ## Install frontend npm dependencies
	cd frontend && npm ci

frontend-dev:   ## Start Next.js dev server (without Docker)
	cd frontend && npm run dev

# ── QA ────────────────────────────────────────────────────────────────────────

playwright:     ## Run Playwright E2E tests (all devices)
	npx playwright test

playwright-ui:  ## Open Playwright UI mode
	npx playwright test --ui

playwright-samsung: ## Run Playwright tests on Samsung Galaxy A13 profile only
	npx playwright test --project=samsung-a13
