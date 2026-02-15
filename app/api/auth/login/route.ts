import { NextResponse } from "next/server"
import { verifyCredentials, createSession, checkLoginAttempts, recordFailedAttempt, clearAttempts } from "@/lib/auth"

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown"

  // Check if IP is blocked
  const { allowed, remainingSeconds } = checkLoginAttempts(ip)
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
      recordFailedAttempt(ip)
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    clearAttempts(ip)
    await createSession(username)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    )
  }
}
