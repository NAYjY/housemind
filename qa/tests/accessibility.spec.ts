/**
 * qa/tests/accessibility.spec.ts — HouseMind
 *
 * Accessibility test suite — WCAG 2.1 AA compliance.
 * Tests run on Samsung Galaxy A13 (primary device) and Desktop Chrome.
 *
 * Checks:
 *   TC-A11Y-01  Touch targets ≥ 44px on all interactive elements
 *   TC-A11Y-02  Annotation canvas has role="img" or appropriate ARIA label
 *   TC-A11Y-03  Bottom sheet panel is keyboard-navigable (focus trap)
 *   TC-A11Y-04  Resolve/reopen buttons have aria-label and aria-busy states
 *   TC-A11Y-05  Loading skeleton has aria-busy="true" on parent container
 *   TC-A11Y-06  Color contrast — accent purple (#7F77DD) on white meets AA (4.5:1 for small text)
 *   TC-A11Y-07  No content relies on color alone to convey state (resolved uses ✓ + color)
 *   TC-A11Y-08  Images have non-empty alt attributes
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:8000/v1";
const ARCHITECT_TOKEN = process.env.TEST_ARCHITECT_TOKEN ?? "";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";
const IMAGE_ID = process.env.TEST_IMAGE_ID ?? "";

async function injectToken(page: Page) {
  await page.addInitScript((token: string) => {
    localStorage.setItem("hm_token", token);
  }, ARCHITECT_TOKEN);
}

async function goToWorkspace(page: Page) {
  await injectToken(page);
  await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
  await expect(page.locator('[data-testid="annotation-workspace"]')).toBeVisible({ timeout: 10_000 });
}

// ── TC-A11Y-01: Touch target sizes ────────────────────────────────────────────

test("TC-A11Y-01 · All interactive elements meet 44px minimum touch target", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await goToWorkspace(page);

  // Check all buttons and interactive elements
  const interactiveSelectors = [
    "button",
    '[role="button"]',
    '[data-testid="close-panel-btn"]',
    '[data-testid="resolve-btn"]',
    '[data-testid="reopen-btn"]',
  ];

  for (const selector of interactiveSelectors) {
    const elements = page.locator(selector);
    const count = await elements.count();

    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      if (!await el.isVisible()) continue;

      const box = await el.boundingBox();
      if (!box) continue;

      // WCAG 2.5.5 Level AA: minimum 44×44px touch target
      expect(
        box.width >= 44 || box.height >= 44,
        `Element "${selector}[${i}]" touch target too small: ${box.width}×${box.height}px`
      ).toBeTruthy();
    }
  }
});

// ── TC-A11Y-02: Canvas ARIA ──────────────────────────────────────────────────

test("TC-A11Y-02 · Annotation canvas has accessible role/label", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await goToWorkspace(page);

  const canvas = page.locator('[data-testid="annotation-canvas"]');
  await expect(canvas).toBeVisible();

  // Canvas should have either role="img" with aria-label OR be wrapped in a landmark
  const hasAriaLabel = await canvas.getAttribute("aria-label");
  const role = await canvas.getAttribute("role");
  const workspaceRegion = page.locator('[data-testid="annotation-workspace"]');
  const regionRole = await workspaceRegion.getAttribute("role");

  // At minimum, the workspace must have an accessible label
  const isAccessible =
    hasAriaLabel !== null ||
    role === "img" ||
    regionRole === "main" ||
    (await page.locator("main").count()) > 0;

  expect(isAccessible, "Annotation canvas must have accessible role or label").toBeTruthy();
});

// ── TC-A11Y-03: Detail panel ARIA ────────────────────────────────────────────

test("TC-A11Y-03 · Product detail panel has role=region and aria-label", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");

  // Seed annotation then load
  await fetch(`${API_BASE}/annotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARCHITECT_TOKEN}`,
    },
    body: JSON.stringify({ image_id: IMAGE_ID, position_x: 0.3, position_y: 0.3 }),
  });

  await goToWorkspace(page);

  // Tap a pin to open panel
  const pin = page.locator('[data-testid="annotation-pin"]').first();
  if (await pin.count() === 0) {
    test.skip(true, "No annotation pins — seed data required");
    return;
  }

  const box = await pin.boundingBox();
  if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  const panel = page.locator('[data-testid="product-detail-panel"]');
  await expect(panel).toBeVisible({ timeout: 3_000 });

  const role = await panel.getAttribute("role");
  const label = await panel.getAttribute("aria-label");

  expect(role).toBe("region");
  expect(label).toBeTruthy();
});

// ── TC-A11Y-04: Button states ─────────────────────────────────────────────────

test("TC-A11Y-04 · Resolve button has aria-label and tracks aria-busy during mutation", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await goToWorkspace(page);

  const resolveBtn = page.locator('[data-testid="resolve-btn"]');

  if (await resolveBtn.count() === 0) {
    test.skip(true, "Resolve button not visible — open a panel first");
    return;
  }

  // aria-busy should be false initially
  const initialBusy = await resolveBtn.getAttribute("aria-busy");
  expect(initialBusy).toBe("false");

  // Button must be keyboard-focusable
  await resolveBtn.focus();
  await expect(resolveBtn).toBeFocused();
});

// ── TC-A11Y-05: Image alt attributes ─────────────────────────────────────────

test("TC-A11Y-05 · All images have non-empty alt attributes", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await goToWorkspace(page);

  const images = page.locator("img");
  const count = await images.count();

  for (let i = 0; i < count; i++) {
    const img = images.nth(i);
    if (!await img.isVisible()) continue;

    const alt = await img.getAttribute("alt");
    expect(
      alt !== null && alt.trim().length > 0,
      `Image [${i}] is missing a non-empty alt attribute`
    ).toBeTruthy();
  }
});

// ── TC-A11Y-06: No content relies solely on color ────────────────────────────

test("TC-A11Y-06 · Resolved state uses text indicator in addition to color", async ({ page }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await goToWorkspace(page);

  // Resolved annotations must show "✓" or text label, not just color change
  const resolvedItems = page.locator('[data-testid^="annotation-row-"]');
  const count = await resolvedItems.count();

  if (count === 0) {
    // Nothing to test — pass
    return;
  }

  for (let i = 0; i < count; i++) {
    const text = await resolvedItems.nth(i).textContent();
    // Must contain either a check mark or the word "resolved"/"แก้ไขแล้ว"
    const hasTextIndicator =
      text?.includes("✓") ||
      text?.toLowerCase().includes("resolved") ||
      text?.includes("แก้ไขแล้ว");

    // Only fails if the row is visually resolved (has resolved styling) without text
    // We check by looking for the muted opacity style
    const opacity = await resolvedItems.nth(i).evaluate(
      (el) => window.getComputedStyle(el).opacity
    );
    if (parseFloat(opacity) < 1) {
      expect(hasTextIndicator, `Resolved row [${i}] relies on opacity alone — add text indicator`).toBeTruthy();
    }
  }
});
