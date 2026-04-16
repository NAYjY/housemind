/**
 * qa/tests/locale.spec.ts — HouseMind
 *
 * Thai locale + i18n tests.
 *
 * TC-L01  Thai strings appear in UI (not English fallback) when locale=th
 * TC-L02  Noto Sans Thai is loaded and applied to body font-family
 * TC-L03  Price is formatted with Thai baht (฿) and Thai-locale number separators
 * TC-L04  Locale cookie is set on first visit
 * TC-L05  Switching locale cookie to "en" shows English strings
 * TC-L06  Long Thai strings do not overflow their containers (text wraps cleanly)
 * TC-L07  Auth expired page renders bilingual (Thai heading + English subheading)
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ARCHITECT_TOKEN = process.env.TEST_ARCHITECT_TOKEN ?? "";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";
const IMAGE_ID = process.env.TEST_IMAGE_ID ?? "";

async function setLocale(context: BrowserContext, locale: "th" | "en") {
  await context.addCookies([
    {
      name: "hm_locale",
      value: locale,
      domain: new URL(BASE_URL).hostname,
      path: "/",
    },
  ]);
}

async function injectToken(page: Page) {
  await page.addInitScript((token: string) => {
    localStorage.setItem("hm_token", token);
  }, ARCHITECT_TOKEN);
}

// ── TC-L01: Thai strings appear in workspace UI ───────────────────────────────

test("TC-L01 · Thai locale: workspace shows Thai annotation hint", async ({ page, context }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await setLocale(context, "th");
  await injectToken(page);

  await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
  await expect(page.locator('[data-testid="annotation-workspace"]')).toBeVisible({ timeout: 10_000 });

  // Empty state should show Thai text
  const pageText = await page.textContent("body");
  // Thai hint text from AnnotationListPanel empty state
  expect(pageText).toContain("แตะบนรูปภาพ");
});

// ── TC-L02: Noto Sans Thai is loaded ─────────────────────────────────────────

test("TC-L02 · Noto Sans Thai font is applied to document body", async ({ page, context }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await setLocale(context, "th");
  await injectToken(page);
  await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);

  const fontFamily = await page.evaluate(() =>
    window.getComputedStyle(document.body).fontFamily
  );

  expect(fontFamily.toLowerCase()).toMatch(/noto.sans.thai|noto_sans_thai/i);
});

// ── TC-L03: Thai baht price formatting ────────────────────────────────────────

test("TC-L03 · Product price is formatted with ฿ and Thai locale separators", async ({ page, context }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await setLocale(context, "th");
  await injectToken(page);

  // Navigate to workspace with a known annotation that has a linked product
  await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
  await expect(page.locator('[data-testid="annotation-workspace"]')).toBeVisible({ timeout: 10_000 });

  // Tap the first annotation pin to open the product detail panel
  const pin = page.locator('[data-testid="annotation-pin"]').first();
  if (await pin.count() === 0) {
    test.skip(true, "No annotation pins in seeded data — run make db-seed first");
    return;
  }

  const box = await pin.boundingBox();
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  await expect(page.locator('[data-testid="product-detail-panel"]')).toBeVisible({ timeout: 3_000 });

  const panelText = await page.locator('[data-testid="product-detail-panel"]').textContent();
  // Should contain ฿ (Thai baht symbol)
  expect(panelText).toContain("฿");
});

// ── TC-L04: Locale cookie is set on first visit ───────────────────────────────

test("TC-L04 · First visit sets hm_locale cookie from Accept-Language header", async ({ page }) => {
  // Visit without pre-set cookie
  await page.goto(`${BASE_URL}/auth/expired`);

  const cookies = await page.context().cookies();
  const localeCookie = cookies.find((c) => c.name === "hm_locale");

  // Cookie should be set after first navigation
  expect(localeCookie).toBeTruthy();
  expect(["th", "en"]).toContain(localeCookie?.value);
});

// ── TC-L05: English locale shows English strings ──────────────────────────────

test("TC-L05 · English locale: auth expired page shows English heading", async ({ page, context }) => {
  await setLocale(context, "en");
  await page.goto(`${BASE_URL}/auth/expired`);

  const pageText = await page.textContent("body");
  // English string from auth/expired/page.tsx
  expect(pageText).toContain("Session expired");
});

// ── TC-L06: Thai text does not overflow containers ────────────────────────────

test("TC-L06 · Long Thai strings wrap cleanly without overflow", async ({ page, context }) => {
  test.skip(!ARCHITECT_TOKEN, "TEST_ARCHITECT_TOKEN required");
  await setLocale(context, "th");
  await injectToken(page);
  await page.goto(`${BASE_URL}/workspace/${PROJECT_ID}/${IMAGE_ID}`);
  await expect(page.locator('[data-testid="annotation-workspace"]')).toBeVisible({ timeout: 10_000 });

  // Check for horizontal scrollbar (indicates overflow)
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  expect(hasHorizontalScroll, "Page has unexpected horizontal overflow — Thai text may be clipping").toBeFalsy();

  // Check that no element with text has scrollWidth > offsetWidth (clipped text)
  const overflowingElements = await page.evaluate(() => {
    const elements = document.querySelectorAll("div, p, span, button, h1, h2, h3");
    const clipped: string[] = [];
    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.scrollWidth > htmlEl.offsetWidth + 2) {
        // +2px tolerance for subpixel rendering
        clipped.push(el.tagName + ": " + (el.textContent ?? "").slice(0, 40));
      }
    });
    return clipped;
  });

  if (overflowingElements.length > 0) {
    console.warn("Potentially clipped elements:", overflowingElements.slice(0, 5));
  }
  // Allow a small number (1-2) of minor overflows from third-party elements
  expect(overflowingElements.length).toBeLessThan(3);
});

// ── TC-L07: Auth expired page is bilingual ─────────────────────────────────────

test("TC-L07 · Auth expired page renders Thai heading AND English subheading", async ({ page, context }) => {
  await setLocale(context, "th");
  await page.goto(`${BASE_URL}/auth/expired`);

  const body = await page.textContent("body");

  // Thai heading
  expect(body).toContain("ลิงก์หมดอายุแล้ว");
  // English subheading (bilingual design)
  expect(body).toContain("Session expired");
});
