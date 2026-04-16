/**
 * qa/global-setup.ts — HouseMind
 * Runs once before the entire Playwright suite.
 *
 * Responsibilities:
 *   1. Validate required env vars
 *   2. Verify API + frontend are reachable
 *   3. Mint JWT tokens for all four roles (if TEST_*_TOKEN not pre-set)
 *      by redeeming the seed invite tokens (from db/seed.py)
 *   4. Write tokens to process.env so all tests can read them
 */

import { chromium, FullConfig } from "@playwright/test";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:8000/v1";
const FRONTEND_BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Seed tokens created by db/seed.py — used to mint role-specific JWTs
const SEED_TOKENS: Record<string, string> = {
  contractor: "seed-token-contractor-do-not-use-in-prod",
  homeowner:  "seed-token-homeowner-do-not-use-in-prod",
};

async function redeemToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token as string;
  } catch {
    return null;
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log("\n── Playwright Global Setup ─────────────────────────────");

  // 1. Check API health
  try {
    const healthRes = await fetch(API_BASE.replace("/v1", "") + "/health");
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    console.log("  ✓ API healthy");
  } catch (err) {
    console.error(`  ✗ API unreachable at ${API_BASE}: ${err}`);
    throw new Error(
      `Cannot reach API at ${API_BASE}. ` +
      "Make sure the backend is running (make up or make up-db + uvicorn)"
    );
  }

  // 2. Check frontend
  try {
    const feRes = await fetch(FRONTEND_BASE);
    if (!feRes.ok && feRes.status !== 307) throw new Error(`HTTP ${feRes.status}`);
    console.log("  ✓ Frontend reachable");
  } catch (err) {
    console.warn(`  ⚠ Frontend may not be running at ${FRONTEND_BASE}: ${err}`);
    // Non-fatal — API-only tests can still run
  }

  // 3. Mint tokens for secondary roles if not pre-set
  for (const [role, seedToken] of Object.entries(SEED_TOKENS)) {
    const envKey = `TEST_${role.toUpperCase()}_TOKEN`;
    if (!process.env[envKey]) {
      const jwt = await redeemToken(seedToken);
      if (jwt) {
        process.env[envKey] = jwt;
        console.log(`  ✓ Minted JWT for role: ${role}`);
      } else {
        console.warn(`  ⚠ Could not mint JWT for role: ${role} (seed data may not be loaded)`);
      }
    } else {
      console.log(`  ✓ Using pre-set token for role: ${role}`);
    }
  }

  // 4. Validate architect token exists
  if (!process.env.TEST_ARCHITECT_TOKEN) {
    console.warn(
      "  ⚠ TEST_ARCHITECT_TOKEN not set — most tests will be skipped.\n" +
      "    Set this env var to a valid architect JWT to run the full suite."
    );
  } else {
    console.log("  ✓ Architect token present");
  }

  // 5. Log test target IDs
  if (process.env.TEST_PROJECT_ID) {
    console.log(`  ✓ TEST_PROJECT_ID = ${process.env.TEST_PROJECT_ID}`);
    console.log(`  ✓ TEST_IMAGE_ID   = ${process.env.TEST_IMAGE_ID}`);
  } else {
    console.warn(
      "  ⚠ TEST_PROJECT_ID not set — workspace tests will be skipped.\n" +
      "    Run: make db-seed  then set TEST_PROJECT_ID and TEST_IMAGE_ID."
    );
  }

  console.log("────────────────────────────────────────────────────────\n");
}
