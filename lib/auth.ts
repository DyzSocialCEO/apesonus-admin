import { cookies } from "next/headers"
import crypto from "crypto"

const ADMIN_COOKIE_NAME = "stokmoji_admin_session"
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000

interface AdminSession {
  username: string
  loginAt: number
  expiresAt: number
}

// Get signing secret — falls back to ADMIN_PASSWORD if SESSION_SECRET not set
function getSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "stokmoji-fallback-secret"
}

// Sign session data with HMAC-SHA256
function signSession(payload: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex")
}

// Create signed token: base64(payload).signature
function createSignedToken(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64")
  const signature = signSession(payload)
  return `${payload}.${signature}`
}

// Verify and parse signed token
function verifySignedToken(token: string): AdminSession | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  const expectedSignature = signSession(payload)

  // Timing-safe comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return null
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null

  try {
    return JSON.parse(Buffer.from(payload, "base64").toString())
  } catch {
    return null
  }
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const validUsername = process.env.ADMIN_USERNAME
  const validPassword = process.env.ADMIN_PASSWORD

  if (!validUsername || !validPassword) {
    console.error("Admin credentials not configured")
    return false
  }

  return username === validUsername && password === validPassword
}

export async function createSession(username: string): Promise<void> {
  const cookieStore = await cookies()
  const now = Date.now()

  const session: AdminSession = {
    username,
    loginAt: now,
    expiresAt: now + SESSION_DURATION,
  }

  const signedToken = createSignedToken(session)

  cookieStore.set(ADMIN_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000,
    path: "/",
  })
}

export async function getSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return null
  }

  // Verify HMAC signature
  const session = verifySignedToken(sessionCookie.value)

  if (!session) {
    // Invalid or forged token — destroy it
    await destroySession()
    return null
  }

  if (Date.now() > session.expiresAt) {
    await destroySession()
    return null
  }

  return session
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}
