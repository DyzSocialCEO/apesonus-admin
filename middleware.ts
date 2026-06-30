import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Admin panel middleware — session guard + role routing.
 *
 * Reads the role claim from the (signed) session cookie for ROUTING only —
 * it does not verify the HMAC here (Edge runtime). That's safe: every route's
 * getSession() does the full signature check, so a tampered cookie that flips
 * role→admin fails verification inside the handler and gets a 401. This layer
 * just routes honest sessions to the right place and short-circuits fast.
 *
 *   - super-admin (role "admin", or legacy sessions with no role) → full access
 *   - partner    (role "partner")                                 → /partner only
 */

const ADMIN_COOKIE_NAME = "apesonus_admin_session"

function roleFromCookie(cookie: string | undefined): "admin" | "partner" | null {
  if (!cookie || !cookie.includes(".")) return null
  try {
    const payload = cookie.split(".")[0]
    const json = JSON.parse(atob(payload)) as { role?: string }
    return json.role === "partner" ? "partner" : "admin" // legacy (no role) = admin
  } catch {
    return null
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow-list: anything the login flow needs
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout") {
    return NextResponse.next()
  }

  const role = roleFromCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const isApi = (p: string) => pathname.startsWith(p)

  // ── Partner portal area ──
  if (pathname.startsWith("/partner") || pathname.startsWith("/api/partner")) {
    if (!role) {
      if (isApi("/api/partner")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return NextResponse.redirect(new URL("/login", req.url))
    }
    if (role !== "partner") {
      // an admin wandered into the partner area → send them home
      if (isApi("/api/partner")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
    return NextResponse.next()
  }

  // ── Admin area (/dashboard, /api/admin) ──
  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/api/admin")
  if (!isProtected) return NextResponse.next()

  if (!role) {
    if (isApi("/api/admin")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.redirect(new URL("/login", req.url))
  }
  if (role === "partner") {
    // partners can never touch the admin → bounce to their portal
    if (isApi("/api/admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.redirect(new URL("/partner", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/admin/:path*",
    "/partner/:path*",
    "/api/partner/:path*",
  ],
}
