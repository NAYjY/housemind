/**
 * lib/auth.ts — HouseMind
 * Token storage, JWT decode (client-side, no verification), and role utilities.
 *
 * Token lifecycle:
 *   1. POST /v1/auth/redeem → { access_token, role, user_id, expires_in }
 *   2. Store in localStorage["hm_token"]
 *   3. All authFetch() calls read this and inject Authorization header
 *   4. On 401 response → clear token, redirect /auth/expired
 */

const TOKEN_KEY = "hm_token";
const LOCALE_KEY = "hm_locale";

export interface TokenPayload {
  sub: string;
  user_id: string;
  email: string;
  role: "architect" | "contractor" | "homeowner" | "supplier";
  exp: number;
  iat: number;
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function setLocale(locale: "th" | "en"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
  document.cookie = `hm_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

// ── Decode (no signature verification — server verifies) ─────────────────────

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

export function getCurrentUser(): TokenPayload | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  // Check expiry client-side (server will also enforce)
  if (payload.exp * 1000 < Date.now()) {
    clearToken();
    return null;
  }
  return payload;
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

export async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/expired";
    }
  }

  return res;
}
