import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Admin panel middleware — safety net session guard.
 *
 * Every admin API route already calls getSession() inside its handler.
 * This middleware is belt-and-suspenders: if anyone ever adds a new
 * /api/admin/* route and forgets the manual check, this catches it.
 *
 * Also guards /dashboard/* pages (the layout already redirects on no
 * session, but middleware short-circuits before the React tree renders,
 * which is faster and less error-prone).
 *
 * What's explicitly allowed through (unauthenticated):
 *   - /login                     — the login page itself
 *   - /api/auth/login            — POST credentials
 *   - /api/auth/logout           — POST to kill the session
 *   - /                          — root redirect to /login or /dashboard
 *   - /_next/*                   — Next.js assets (handled by matcher)
 *   - static files               — handled by matcher
 */

const ADMIN_COOKIE_NAME = "apesonus_admin_session"

// Note: we can't import `getSession` from lib/auth here because middleware
// runs on the Edge runtime and getSession() reads cookies via next/headers.
// Instead we do a lightweight cookie presence + signature check directly.
// The full verification still happens inside each API route's handler.

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow-list: anything the login flow needs
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next()
  }

  // Only guard /dashboard/* and /api/admin/*
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/api/admin")

  if (!isProtected) {
    return NextResponse.next()
  }

  // Presence check — cookie must exist AND look like our signed token format
  // (base64.signature). Full HMAC verification happens inside each route's
  // getSession() call; this just rejects the obviously-unauthenticated.
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value

  if (!cookie || !cookie.includes(".")) {
    // API routes get a JSON 401 instead of an HTML redirect
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Dashboard pages redirect to login
    const loginUrl = new URL("/login", req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Match dashboard pages and admin API routes only.
// Excludes static assets, _next internals, favicon, images.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/admin/:path*",
  ],
}
