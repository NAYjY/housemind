// middleware.ts — HouseMind
// next-intl requires a middleware to read the locale cookie and set request headers.
// Without this, the server-side i18n/request.ts cannot read the cookie properly.

import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware({
  locales: ["th", "en"],
  defaultLocale: "th",
  localeDetection: false, // we manage locale ourselves via hm_locale cookie
});

export function middleware(request: NextRequest) {
  // Auth guard: redirect to /auth/expired if JWT is missing on protected routes
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth/");
  const isApiRoute = pathname.startsWith("/api/");
  const isPublic = isAuthRoute || isApiRoute || pathname === "/";

  if (!isPublic) {
    // Token is in localStorage — can't check server-side.
    // Auth is enforced by API returning 401 → client redirects.
    // This middleware only handles i18n.
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Match all paths except static files and next internals
    '/((?!api|_next/static|_next/image|.*\\..*|favicon.ico).*)',
  ],
};


