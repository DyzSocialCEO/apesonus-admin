import { cookies } from "next/headers"
import crypto from "crypto"
import { kvGet, kvSet, kvDelete } from "./upstash"

const ADMIN_COOKIE_NAME = "apesonus_admin_session"
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// ── Login attempt tracking ──────────────────────────────────────
// Persists to Upstash Redis so attempts survive Railway redeploys
// and are shared across multiple container instances. Falls back
// to in-memory Map if Upstash is not configured (local dev only).

const MAX_ATTEMPTS = 5
const BLOCK_DURATION = 15 * 60 * 1000 // 15 minutes
const BLOCK_TTL_SECONDS = 16 * 60 // slightly longer than block duration so keys expire naturally

interface AttemptEntry {
  count: number
  blockedUntil: number
}

// In-memory fallback store (used when Upstash is not configured)
const fallbackAttempts = new Map<string, AttemptEntry>()

function attemptKey(ip: string): string {
  return `admin-login-attempts:${ip}`
}

async function readAttempts(ip: string): Promise<AttemptEntry | null> {
  const fromRedis = await kvGet<AttemptEntry>(attemptKey(ip))
  if (fromRedis) return fromRedis
  return fallbackAttempts.get(ip) || null
}

async function writeAttempts(ip: string, entry: AttemptEntry): Promise<void> {
  await kvSet(attemptKey(ip), entry, BLOCK_TTL_SECONDS)
  fallbackAttempts.set(ip, entry)
}

async function clearAttemptsForIp(ip: string): Promise<void> {
  await kvDelete(attemptKey(ip))
  fallbackAttempts.delete(ip)
}

// ── Session helpers ─────────────────────────────────────────────

interface AdminSession {
  username: string
  loginAt: number
  expiresAt: number
}

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET must be set in environment")
  }
  return secret
}

function signSession(payload: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex")
}

function createSignedToken(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64")
  const signature = signSession(payload)
  return `${payload}.${signature}`
}

function verifySignedToken(token: string): AdminSession | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  const expectedSignature = signSession(payload)

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

// ── Public API ──────────────────────────────────────────────────

/**
 * Check if an IP is currently blocked from logging in due to too
 * many failed attempts. Returns { allowed, remainingSeconds }.
 *
 * Async because it reads from Upstash.
 */
export async function checkLoginAttempts(
  ip: string
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const entry = await readAttempts(ip)
  if (!entry) return { allowed: true, remainingSeconds: 0 }

  if (entry.blockedUntil > Date.now()) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((entry.blockedUntil - Date.now()) / 1000),
    }
  }

  // Block expired, reset
  if (entry.count >= MAX_ATTEMPTS) {
    await clearAttemptsForIp(ip)
  }
  return { allowed: true, remainingSeconds: 0 }
}

/**
 * Record a failed login attempt. Escalates to a block once MAX_ATTEMPTS
 * is reached within the window.
 */
export async function recordFailedAttempt(ip: string): Promise<void> {
  const existing = (await readAttempts(ip)) || { count: 0, blockedUntil: 0 }
  existing.count += 1
  if (existing.count >= MAX_ATTEMPTS) {
    existing.blockedUntil = Date.now() + BLOCK_DURATION
  }
  await writeAttempts(ip, existing)
}

/**
 * Clear attempts for an IP after a successful login.
 */
export async function clearAttempts(ip: string): Promise<void> {
  await clearAttemptsForIp(ip)
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
    sameSite: "strict",
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
