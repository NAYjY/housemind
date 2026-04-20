/**
 * qa/tests/role-access.spec.ts — HouseMind
 *
 * Role-based access control tests (API layer).
 * Verifies that every role gets exactly the access level it should.
 *
 * Matrix:
 *   Operation                 | Architect | Contractor | Homeowner | Supplier
 *   ─────────────────────────────────────────────────────────────────────────
 *   List annotations          |    ✓      |     ✓      |     ✓     |    ✓
 *   Create annotation         |    ✓      |     ✗      |     ✗     |    ✗
 *   Delete annotation         |    ✓      |     ✗      |     ✗     |    ✗
 *   Resolve annotation        |    ✓      |     ✓      |     ✗     |    ✗
 *   Reopen annotation         |    ✓      |     ✓      |     ✗     |    ✗
 *   Get product detail        |    ✓      |     ✓      |     ✓     |    ✓
 *   Create invite             |    ✓      |     ✗      |     ✗     |    ✗
 *   Upload presign            |    ✓      |     ✗      |     ✗     |    ✗
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:8000/api/v1";
const IMAGE_ID = process.env.TEST_IMAGE_ID ?? "";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";

// Tokens for each role (must match seed data in db/seed.py)
const TOKENS = {
  architect:   process.env.TEST_ARCHITECT_TOKEN ?? "",
  contractor:  process.env.TEST_CONTRACTOR_TOKEN ?? "",
  homeowner:   process.env.TEST_HOMEOWNER_TOKEN ?? "",
  supplier:    process.env.TEST_SUPPLIER_TOKEN ?? "",
};

type Role = keyof typeof TOKENS;

function authHeaders(role: Role) {
  return {
    Authorization: `Bearer ${TOKENS[role]}`,
    "Content-Type": "application/json",
  };
}

function skipIfMissingToken(role: Role) {
  if (!TOKENS[role]) test.skip(true, `${role.toUpperCase()}_TOKEN not set`);
}

// ── List annotations — all roles allowed ─────────────────────────────────────

for (const role of ["architect", "contractor", "homeowner", "supplier"] as Role[]) {
  test(`RBAC · List annotations: ${role} → 200`, async ({ request }) => {
    skipIfMissingToken(role);
    const res = await request.get(`${API_BASE}/annotations`, {
      params: { image_id: IMAGE_ID },
      headers: authHeaders(role),
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBeTruthy();
  });
}

// ── Create annotation — architect only ────────────────────────────────────────

test("RBAC · Create annotation: architect → 201", async ({ request }) => {
  skipIfMissingToken("architect");
  const res = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 0.1, position_y: 0.1 },
    headers: authHeaders("architect"),
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.resolved_at).toBeNull();
});

for (const role of ["contractor", "homeowner", "supplier"] as Role[]) {
  test(`RBAC · Create annotation: ${role} → 403`, async ({ request }) => {
    skipIfMissingToken(role);
    const res = await request.post(`${API_BASE}/annotations`, {
      data: { image_id: IMAGE_ID, position_x: 0.2, position_y: 0.2 },
      headers: authHeaders(role),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error_code).toBe("ACCESS_DENIED");
  });
}

// ── Resolve annotation — architect + contractor only ─────────────────────────

test("RBAC · Resolve annotation: contractor → 200", async ({ request }) => {
  skipIfMissingToken("architect");
  skipIfMissingToken("contractor");

  // Create annotation as architect
  const createRes = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 0.6, position_y: 0.6 },
    headers: authHeaders("architect"),
  });
  expect(createRes.status()).toBe(201);
  const { id } = await createRes.json();

  // Contractor resolves
  const resolveRes = await request.patch(`${API_BASE}/annotations/${id}/resolve`, {
    data: {},
    headers: authHeaders("contractor"),
  });
  expect(resolveRes.status()).toBe(200);
  const resolved = await resolveRes.json();
  expect(resolved.resolved_at).not.toBeNull();
  expect(resolved.resolved_by).not.toBeNull();
});

for (const role of ["homeowner", "supplier"] as Role[]) {
  test(`RBAC · Resolve annotation: ${role} → 403`, async ({ request }) => {
    skipIfMissingToken("architect");
    skipIfMissingToken(role);

    const createRes = await request.post(`${API_BASE}/annotations`, {
      data: { image_id: IMAGE_ID, position_x: 0.7, position_y: 0.7 },
      headers: authHeaders("architect"),
    });
    const { id } = await createRes.json();

    const resolveRes = await request.patch(`${API_BASE}/annotations/${id}/resolve`, {
      data: {},
      headers: authHeaders(role),
    });
    expect(resolveRes.status()).toBe(403);
    expect((await resolveRes.json()).error_code).toBe("ACCESS_DENIED");
  });
}

// ── Delete annotation — architect only ────────────────────────────────────────

test("RBAC · Delete annotation: architect → 204", async ({ request }) => {
  skipIfMissingToken("architect");

  const createRes = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 0.8, position_y: 0.8 },
    headers: authHeaders("architect"),
  });
  const { id } = await createRes.json();

  const deleteRes = await request.delete(`${API_BASE}/annotations/${id}`, {
    headers: authHeaders("architect"),
  });
  expect(deleteRes.status()).toBe(204);
});

for (const role of ["contractor", "homeowner", "supplier"] as Role[]) {
  test(`RBAC · Delete annotation: ${role} → 403`, async ({ request }) => {
    skipIfMissingToken("architect");
    skipIfMissingToken(role);

    const createRes = await request.post(`${API_BASE}/annotations`, {
      data: { image_id: IMAGE_ID, position_x: 0.9, position_y: 0.9 },
      headers: authHeaders("architect"),
    });
    const { id } = await createRes.json();

    const deleteRes = await request.delete(`${API_BASE}/annotations/${id}`, {
      headers: authHeaders(role),
    });
    expect(deleteRes.status()).toBe(403);
  });
}

// ── Create invite — architect only ────────────────────────────────────────────

test("RBAC · Create invite: architect → 201", async ({ request }) => {
  skipIfMissingToken("architect");

  const res = await request.post(`${API_BASE}/invites`, {
    data: {
      project_id: PROJECT_ID,
      invitee_email: `rbac-test-${Date.now()}@housemind.com`,
      invitee_role: "homeowner",
    },
    headers: authHeaders("architect"),
  });
  expect(res.status()).toBe(201);
});

for (const role of ["contractor", "homeowner", "supplier"] as Role[]) {
  test(`RBAC · Create invite: ${role} → 403`, async ({ request }) => {
    skipIfMissingToken(role);

    const res = await request.post(`${API_BASE}/invites`, {
      data: {
        project_id: PROJECT_ID,
        invitee_email: `rbac-blocked-${Date.now()}@housemind.com`,
        invitee_role: "homeowner",
      },
      headers: authHeaders(role),
    });
    expect(res.status()).toBe(403);
  });
}

// ── Unauthenticated — all protected routes return 403 ────────────────────────

test("RBAC · No token: annotation list → 403", async ({ request }) => {
  const res = await request.get(`${API_BASE}/annotations`, {
    params: { image_id: IMAGE_ID },
  });
  expect(res.status()).toBe(403);
});

test("RBAC · No token: create annotation → 403", async ({ request }) => {
  const res = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 0.5, position_y: 0.5 },
  });
  expect(res.status()).toBe(403);
});

// ── Input validation — position out of [0,1] range ────────────────────────────

test("RBAC · Position validation: position_x=1.5 → 422 VALIDATION_ERROR", async ({ request }) => {
  skipIfMissingToken("architect");

  const res = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 1.5, position_y: 0.5 },
    headers: authHeaders("architect"),
  });
  expect(res.status()).toBe(422);
  expect((await res.json()).error_code).toBe("VALIDATION_ERROR");
});

test("RBAC · Position validation: position_y=-0.1 → 422 VALIDATION_ERROR", async ({ request }) => {
  skipIfMissingToken("architect");

  const res = await request.post(`${API_BASE}/annotations`, {
    data: { image_id: IMAGE_ID, position_x: 0.5, position_y: -0.1 },
    headers: authHeaders("architect"),
  });
  expect(res.status()).toBe(422);
  expect((await res.json()).error_code).toBe("VALIDATION_ERROR");
});
