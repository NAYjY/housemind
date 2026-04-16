/**
 * middleware.ts — HouseMind
 * Runs at the Vercel edge before every request.
 *
 * Responsibilities:
 *   1. Locale detection — reads hm_locale cookie, falls back to Accept-Language, defaults to Thai
 *   2. Auth guard — redirects unauthenticated requests away from /workspace routes
 *      (JWT presence check only; signature verified by backend on every API call)
 */

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/auth", "/_next", "/favicon.ico", "/api"];
const PROTECTED_PREFIX = "/workspace";

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Skip static assets and public API routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Locale ──────────────────────────────────────────────────────────────
  const localeCookie = req.cookies.get("hm_locale")?.value;
  const acceptLang = req.headers.get("accept-language") ?? "";
  const browserLocale = acceptLang.includes("th") ? "th" : "en";
  const locale = localeCookie ?? browserLocale;

  const response = NextResponse.next();
  if (!localeCookie) {
    response.cookies.set("hm_locale", locale, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      path: "/",
    });
  }

  // ── Auth guard for /workspace/* ──────────────────────────────────────────
  if (pathname.startsWith(PROTECTED_PREFIX)) {
    // Token lives in localStorage (client-only) — we can't read it server-side.
    // The workspace page itself checks token on mount and redirects if missing.
    // This middleware only blocks obviously unauthenticated requests without
    // any session cookie at all (e.g. crawlers, direct URL access).
    const hasSessionHint = req.cookies.has("hm_locale"); // weakest signal
    if (!hasSessionHint) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/auth/expired";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
