/**
 * lib/auth.ts — HouseMind
 *
 * SEC-13 fix: JWT is now stored in an httpOnly cookie set by the backend.
 *   httpOnly cookies are inaccessible to JavaScript — XSS cannot steal them.
 *   The frontend no longer stores the raw JWT in localStorage.
 *
 *   What localStorage still stores:
 *     - hm_role   : user role string (architect/contractor/homeowner/supplier)
 *     - hm_user_id: user UUID
 *     - hm_locale : locale preference
 *
 *   These fields contain no secret material.  They are used purely for
 *   role-gated UI rendering.  The backend re-derives identity from the
 *   httpOnly cookie on every API call — it does not trust these values.
 *
 *   Token lifecycle:
 *     1. POST /v1/auth/login or /v1/auth/register
 *        → backend sets Set-Cookie: hm_token=<jwt>; HttpOnly; Secure; SameSite=Lax
 *        → response body returns { access_token, role, user_id, expires_in }
 *     2. Frontend stores role + user_id in localStorage (not secret)
 *     3. All authFetch() calls use credentials: "include" so the cookie
 *        is automatically attached — no Authorization header needed
 *     4. POST /v1/auth/logout
 *        → backend revokes jti in DB and clears the cookie
 *        → frontend clears localStorage role/user_id
 *
 *   Local dev: the backend also returns access_token in the response body.
 *   If NEXT_PUBLIC_APP_ENV=local, authFetch falls back to Authorization: Bearer
 *   using this token so cross-origin dev (localhost:3000 → localhost:8000)
 *   still works without HTTPS.
 */

const ROLE_KEY    = "hm_role";
const USER_ID_KEY = "hm_user_id";
const LOCALE_KEY  = "hm_locale";

// ── Local dev only: Bearer fallback ──────────────────────────────────────────
// In production the httpOnly cookie handles auth.  In local dev the cookie
// is set on localhost:8000 but the Next.js dev server is on localhost:3000
// (different port = different cookie origin).  The Bearer token in localStorage
// bridges this.
const DEV_TOKEN_KEY = "hm_dev_token";
const _isLocal = () =>
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_APP_ENV === "local";

export interface TokenPayload {
  sub: string;
  user_id: string;
  email: string;
  role: "architect" | "contractor" | "homeowner" | "supplier";
  exp: number;
  iat: number;
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Called after a successful login / register response.
 * Stores non-secret fields from the response body.
 * In local dev also stores the raw token for Bearer fallback.
 */
export function storeSession(data: {
  access_token: string;
  role: string;
  user_id: string;
}): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ROLE_KEY, data.role);
  localStorage.setItem(USER_ID_KEY, data.user_id);
  if (_isLocal()) {
    localStorage.setItem(DEV_TOKEN_KEY, data.access_token);
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(DEV_TOKEN_KEY);
}

export function getStoredRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY);
}

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function setLocale(locale: "th" | "en"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
  document.cookie = `hm_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

// ── getCurrentUser — reads from localStorage (not the JWT) ───────────────────

/**
 * Returns a lightweight user object derived from non-secret localStorage fields.
 * This is used for UI gating only — the backend never trusts these values.
 */
export function getCurrentUser(): TokenPayload | null {
  if (typeof window === "undefined") return null;
  const role = getStoredRole();
  const user_id = getStoredUserId();
  if (!role || !user_id) return null;
  // Return a minimal object that satisfies the TokenPayload shape.
  // exp is unknown here (we don't store it), so set to a far future value —
  // the backend will reject expired tokens via the httpOnly cookie.
  return {
    sub: user_id,
    user_id,
    email: "",  // not stored in localStorage
    role: role as TokenPayload["role"],
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    iat: 0,
  };
}

// ── Role checks ───────────────────────────────────────────────────────────────

export function canWrite(role: string | undefined): boolean {
  return role === "architect";
}

export function canResolve(role: string | undefined): boolean {
  return role === "architect" || role === "contractor";
}

export function isReadOnly(role: string | undefined): boolean {
  return role === "homeowner" || role === "supplier";
}

// ── Authenticated fetch ───────────────────────────────────────────────────────

/**
 * All API calls go through this.
 *
 * Production: credentials: "include" sends the httpOnly cookie automatically.
 *   No Authorization header — the JWT never touches JavaScript memory.
 *
 * Local dev: if hm_dev_token is present in localStorage, sends
 *   Authorization: Bearer <token> as a fallback for cross-origin dev requests
 *   (localhost:3000 → localhost:8000).
 */
export async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  // Local dev Bearer fallback (token has no sensitive production value here)
  if (_isLocal()) {
    const devToken = typeof window !== "undefined"
      ? localStorage.getItem(DEV_TOKEN_KEY)
      : null;
    if (devToken) {
      headers["Authorization"] = `Bearer ${devToken}`;
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",  // sends httpOnly cookie
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/expired";
    }
  }

  return res;
}

/**
 * POST /auth/logout — revokes server-side token and clears httpOnly cookie.
 * Returns true on success.
 */
export async function logout(): Promise<boolean> {
  const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  try {
    await authFetch(`${API}/auth/logout`, { method: "POST" });
  } catch {
    // Best-effort — clear local state regardless
  }
  clearSession();
  return true;
}

// ── Legacy shim — remove once all callsites are migrated ─────────────────────
// Some components still call getToken() / setToken() / clearToken().
// These now do nothing for the JWT (httpOnly cookie handles it) but they
// forward role/user_id storage so the UI still works during migration.

/** @deprecated Use storeSession() instead */
export function setToken(token: string): void {
  if (_isLocal() && typeof window !== "undefined") {
    localStorage.setItem(DEV_TOKEN_KEY, token);
    // Also decode and store role/user_id for local dev
    try {
      const [, payload] = token.split(".");
      if (payload) {
        const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        localStorage.setItem(ROLE_KEY, decoded.role ?? "");
        localStorage.setItem(USER_ID_KEY, decoded.user_id ?? "");
      }
    } catch {
      // ignore
    }
  }
}

/** @deprecated Role is no longer derived from localStorage JWT */
export function getToken(): string | null {
  if (!_isLocal()) return null;
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEV_TOKEN_KEY);
}

/** @deprecated Use clearSession() instead */
export function clearToken(): void {
  clearSession();
}

/** @deprecated Use getCurrentUser() instead */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}
