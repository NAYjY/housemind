/**
 * lib/auth.ts — HouseMind
 *
 * SEC-13: JWT stored in httpOnly cookie set by the backend.
 * JavaScript never touches the raw token in production.
 *
 * localStorage stores only non-secret fields:
 *   hm_role    — for role-gated UI rendering
 *   hm_user_id — for UI identity display
 *   hm_locale  — locale preference
 *
 * Magic-link shims removed (setToken, getToken, decodeToken, clearToken).
 * The /auth/redeem endpoint no longer exists. Use login().
 *
 * Local dev Bearer fallback is preserved for cross-origin dev
 * (localhost:3000 → localhost:8000).
 */

const ROLE_KEY    = "hm_role";
const USER_ID_KEY = "hm_user_id";
const LOCALE_KEY  = "hm_locale";

// Local dev only: Bearer token fallback (cross-origin, no HTTPS)
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

// ── Session storage ───────────────────────────────────────────────────────────

/**
 * Called after a successful login or register response.
 * Stores only non-secret fields from the response body.
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

// ── getCurrentUser ────────────────────────────────────────────────────────────

/**
 * Returns a lightweight user object from non-secret localStorage fields.
 * Used for UI gating only — the backend never trusts these values.
 */
export function getCurrentUser(): TokenPayload | null {
  if (typeof window === "undefined") return null;
  const role = getStoredRole();
  const user_id = getStoredUserId();
  if (!role || !user_id) return null;
  return {
    sub: user_id,
    user_id,
    email: "",
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
 * Production: credentials: "include" sends the httpOnly cookie automatically.
 * Local dev: falls back to Authorization: Bearer from hm_dev_token.
 */
export async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  // Only set Content-Type: application/json when sending a JSON body
  // (not for file uploads or requests with no body)
  if (!headers["Content-Type"] && init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  // Local dev Bearer fallback
  if (_isLocal()) {
    const devToken =
      typeof window !== "undefined"
        ? localStorage.getItem(DEV_TOKEN_KEY)
        : null;
    if (devToken) {
      headers["Authorization"] = `Bearer ${devToken}`;
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/expired";
    }
  }

  // In local dev, if cookie auth fails, try refreshing the dev token
  // This handles the case where the cookie expired but localStorage still has role/userId
  if (res.status === 403 && _isLocal()) {
    const body = await res.clone().json().catch(() => ({}));
    if (body?.error_code === "ACCESS_DENIED" && body?.detail?.includes("not authenticated")) {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.href = "/auth/expired";
      }
    }
  }

  return res;
}

/**
 * POST /auth/logout — revokes the server-side token and clears the httpOnly cookie.
 * Always call this on sign-out; never call clearSession() directly.
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