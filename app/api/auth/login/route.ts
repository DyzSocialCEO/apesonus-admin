import { NextResponse } from "next/server"
import { verifyCredentials, createSession, checkLoginAttempts, recordFailedAttempt, clearAttempts } from "@/lib/auth"
import { adminLoginRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const ip = getClientIp(request)

  // Hard rate limit at the Upstash level — this runs BEFORE we even
  // look at credentials. Stops brute force cold even if the
  // login-attempt tracker is somehow bypassed.
  {
    const { success } = await adminLoginRatelimit().limit(`login:${ip}`)
    if (!success) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 15 minutes." },
        { status: 429 }
      )
    }
  }

  // Softer per-IP tracker (persists across deploys via Upstash)
  const { allowed, remainingSeconds } = await checkLoginAttempts(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${remainingSeconds}s` },
      { status: 429 }
    )
  }

  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      )
    }

    const isValid = await verifyCredentials(username, password)

    if (!isValid) {
      await recordFailedAttempt(ip)
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    await clearAttempts(ip)
    await createSession(username)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
