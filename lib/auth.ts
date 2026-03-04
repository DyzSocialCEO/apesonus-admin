import { cookies } from "next/headers"
import crypto from "crypto"

const ADMIN_COOKIE_NAME = "apesonus_admin_session"
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000

// Login attempt tracking (in-memory, resets on deploy — Upstash upgrade later)
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>()
const MAX_ATTEMPTS = 5
const BLOCK_DURATION = 15 * 60 * 1000 // 15 minutes

interface AdminSession {
  username: string
  loginAt: number
  expiresAt: number
}

// Get signing secret — REQUIRES env var, no fallback
function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!secret) {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set")
  }
  return secret
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

// Check if IP is blocked from too many login attempts
export function checkLoginAttempts(ip: string): { allowed: boolean; remainingSeconds: number } {
  const entry = loginAttempts.get(ip)
  if (!entry) return { allowed: true, remainingSeconds: 0 }

  if (entry.blockedUntil > Date.now()) {
    return { allowed: false, remainingSeconds: Math.ceil((entry.blockedUntil - Date.now()) / 1000) }
  }

  // Block expired, reset
  if (entry.count >= MAX_ATTEMPTS) {
    loginAttempts.delete(ip)
  }
  return { allowed: true, remainingSeconds: 0 }
}

// Record a failed login attempt
export function recordFailedAttempt(ip: string): void {
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 }
  entry.count += 1
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION
  }
  loginAttempts.set(ip, entry)
}

// Clear attempts on successful login
export function clearAttempts(ip: string): void {
  loginAttempts.delete(ip)
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

  // Timing-safe comparison for both username and password
  const usernameMatch =
    username.length === validUsername.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(validUsername))

  const passwordMatch =
    password.length === validPassword.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(validPassword))

  return usernameMatch && passwordMatch
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

  const session = verifySignedToken(sessionCookie.value)

  if (!session) {
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
