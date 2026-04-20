/**
 * qa/tests/critical-path.spec.ts — HouseMind
 *
 * Critical path: invite link → workspace load → place annotation → reply → resolve
 *
 * Device matrix (per QA agent spec):
 *   - Samsung Galaxy A13  (primary — must pass)
 *   - iPhone SE 3rd gen   (secondary)
 *   - iPad Air            (secondary)
 *
 * Run:
 *   npx playwright test qa/tests/critical-path.spec.ts
 *   npx playwright test --project=samsung-a13   (single device)
 *
 * Requires:
 *   PLAYWRIGHT_BASE_URL  staging URL, e.g. https://staging.housemind.app
 *   TEST_ARCHITECT_TOKEN valid JWT for an architect user
 *   TEST_PROJECT_ID      UUID of a seeded test project with ≥ 1 image
 *   TEST_IMAGE_ID        UUID of the first image in the test project
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:8000/api/v1";
const ARCHITECT_TOKEN = process.env.TEST_ARCHITECT_TOKEN ?? "";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";
const IMAGE_ID = process.env.TEST_IMAGE_ID ?? "";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedJwt(context: BrowserContext, token: string) {
  /** Inject JWT into localStorage so auth headers work without going through the magic-link flow. */
  await context.addInitScript((t) => {
    localStorage.setItem("hm_token", t);
  }, token);
}

async function createInviteViaApi(role: string): Promise<string> {
  /** Call the backend directly to generate a magic-link token for a test invitee. */
  const res = await fetch(`${API_BASE}/invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARCHITECT_TOKEN}`,
    },
    body: JSON.stringify({
      project_id: PROJECT_ID,
      invitee_email: `test-${role}-${Date.now()}@housemind.com`,
      invitee_role: role,
    }),
  });
  const body = await res.json();
  return body.invite_id as string;
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe("Critical path — Architect", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN not set — skipping");
    await seedJwt(context, ARCHITECT_TOKEN);
  });

  test("TC-CP-01 · Workspace loads and renders annotation canvas", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);

    // Canvas must be visible
    const canvas = page.locator('[data-testid="annotation-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // At least the base image must be loaded (not a broken img)
    const img = canvas.locator("img").first();
    await expect(img).toHaveAttribute("src", /.+/);

    // Page title
    await expect(page).toHaveTitle(/HouseMind/);
  });

  test("TC-CP-02 · Place an annotation pin on the canvas", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
    const canvas = page.locator('[data-testid="annotation-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Tap at ~40%, 50% of canvas (empty area)
    const tapX = box!.x + box!.width * 0.4;
    const tapY = box!.y + box!.height * 0.5;

    // Simulate touch tap
    await page.touchscreen.tap(tapX, tapY);

    // A new annotation pin must appear
    const pins = page.locator('[data-testid="annotation-pin"]');
    await expect(pins).toHaveCount(1, { timeout: 5_000 });
  });

  test("TC-CP-03 · Tap a pin to open the detail panel", async ({ page }) => {
    // Pre-seed an annotation via API then reload
    const annotationRes = await fetch(`${API_BASE}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      body: JSON.stringify({
        image_id: IMAGE_ID,
        position_x: 0.3,
        position_y: 0.4,
      }),
    });
    expect(annotationRes.status).toBe(201);

    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
    const pin = page.locator('[data-testid="annotation-pin"]').first();
    await expect(pin).toBeVisible({ timeout: 8_000 });

    const box = await pin.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Bottom sheet or detail panel must appear
    const panel = page.locator('[data-testid="product-detail-panel"], [data-testid="bottom-sheet"]');
    await expect(panel).toBeVisible({ timeout: 3_000 });
  });

  test("TC-CP-04 · Resolve an annotation thread (Architect)", async ({ page }) => {
    // Seed annotation
    const annRes = await fetch(`${API_BASE}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      body: JSON.stringify({ image_id: IMAGE_ID, position_x: 0.6, position_y: 0.3 }),
    });
    const ann = await annRes.json();

    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
    await expect(page.locator('[data-testid="annotation-pin"]').first()).toBeVisible({ timeout: 8_000 });

    // Resolve via API (UI resolve button is a separate UI test)
    const resolveRes = await fetch(`${API_BASE}/annotations/${ann.id}/resolve`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      body: JSON.stringify({}),
    });
    expect(resolveRes.status).toBe(200);

    const resolvedAnn = await resolveRes.json();
    expect(resolvedAnn.resolved_at).not.toBeNull();
    expect(resolvedAnn.resolved_by).not.toBeNull();
  });

  test("TC-CP-05 · Delete an annotation via long-press (500 ms)", async ({ page }) => {
    // Seed annotation
    const annRes = await fetch(`${API_BASE}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      body: JSON.stringify({ image_id: IMAGE_ID, position_x: 0.7, position_y: 0.6 }),
    });
    expect(annRes.status).toBe(201);

    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
    const pin = page.locator('[data-testid="annotation-pin"]').first();
    await expect(pin).toBeVisible({ timeout: 8_000 });

    const box = await pin.boundingBox();
    expect(box).not.toBeNull();

    // Simulate long-press: touchstart, hold 600ms, touchend
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.touchscreen.tap(cx, cy); // ensure focus
    await page.dispatchEvent('[data-testid="annotation-canvas"]', "touchstart", {
      touches: [{ clientX: cx, clientY: cy }],
    });
    await page.waitForTimeout(600);
    await page.dispatchEvent('[data-testid="annotation-canvas"]', "touchend", {
      touches: [],
      changedTouches: [{ clientX: cx, clientY: cy }],
    });

    // Pin must disappear after delete
    await expect(page.locator('[data-testid="annotation-pin"]')).toHaveCount(0, { timeout: 3_000 });
  });
});

// ── Magic-link invite flow ────────────────────────────────────────────────────

test.describe("Critical path — Magic-link invite redemption", () => {
  test("TC-CP-06 · Architect creates invite; invitee redeems token → receives JWT", async ({ request }) => {
    test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN not set — skipping");

    // 1. Architect creates invite
    const inviteRes = await request.post(`${API_BASE}/invites`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      data: {
        project_id: PROJECT_ID,
        invitee_email: `homeowner-${Date.now()}@housemind.com`,
        invitee_role: "homeowner",
      },
    });
    expect(inviteRes.status()).toBe(201);
    const invite = await inviteRes.json();
    expect(invite.invite_id).toBeTruthy();

    // 2. Retrieve token from DB directly (test environment only)
    // In staging, email would be sent; here we call a test-only endpoint
    // that returns the token for the given invite_id.
    // This endpoint must only exist when ENVIRONMENT=test.
    const tokenRes = await request.get(`${API_BASE}/test/invite-token/${invite.invite_id}`, {
      headers: { Authorization: `Bearer ${ARCHITECT_TOKEN}` },
    });
    // If the test endpoint is not yet implemented, this test is skipped
    test.skip(tokenRes.status() === 404, "Test token endpoint not available");
    expect(tokenRes.status()).toBe(200);
    const { token } = await tokenRes.json();

    // 3. Invitee redeems token
    const redeemRes = await request.post(`${API_BASE}/auth/redeem`, {
      data: { token },
    });
    expect(redeemRes.status()).toBe(200);
    const jwt = await redeemRes.json();
    expect(jwt.access_token).toBeTruthy();
    expect(jwt.role).toBe("homeowner");
  });
});

// ── Annotation persistence ────────────────────────────────────────────────────

test.describe("Critical path — Annotation persistence", () => {
  test("TC-CP-07 · Annotations survive page reload", async ({ page, context }) => {
    test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN not set — skipping");
    await seedJwt(context, ARCHITECT_TOKEN);

    // Seed annotation via API
    const annRes = await fetch(`${API_BASE}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARCHITECT_TOKEN}`,
      },
      body: JSON.stringify({ image_id: IMAGE_ID, position_x: 0.5, position_y: 0.5 }),
    });
    expect(annRes.status).toBe(201);

    // Load workspace
    await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
    await expect(page.locator('[data-testid="annotation-pin"]').first()).toBeVisible({ timeout: 8_000 });

    // Reload — annotations must still be present (not lost)
    await page.reload();
    await expect(page.locator('[data-testid="annotation-pin"]').first()).toBeVisible({ timeout: 8_000 });
  });
});
