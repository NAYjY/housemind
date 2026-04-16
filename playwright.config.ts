/**
 * playwright.config.ts — HouseMind
 * Device matrix: Samsung Galaxy A13 (primary), iPhone SE 3rd gen, iPad Air, Desktop Chrome.
 * Test suites: critical-path, accessibility, locale, performance, role-access.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./qa/tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa/playwright-report", open: "never" }],
    ["junit", { outputFile: "qa/results.xml" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // ── Primary: Samsung Galaxy A13 (main test device) ──────────────────
    {
      name: "samsung-a13",
      use: {
        viewport: { width: 412, height: 915 },
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
    },
    // ── Secondary: iPhone SE 3rd gen ────────────────────────────────────
    {
      name: "iphone-se3",
      use: {
        ...devices["iPhone SE"],
        isMobile: true,
        hasTouch: true,
      },
    },
    // ── Secondary: iPad Air ─────────────────────────────────────────────
    {
      name: "ipad-air",
      use: {
        viewport: { width: 820, height: 1180 },
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    // ── Desktop Chrome (architect power-user flows) ──────────────────────
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./qa/global-setup.ts",
});
