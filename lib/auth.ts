import { cookies } from "next/headers"
import crypto from "crypto"
import { kvGet, kvSet, kvDelete } from "./upstash"
import { createAdminClient } from "./supabase"

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
  role?: "admin" | "partner"   // legacy sessions (no role) are treated as admin
  partnerId?: string           // set only for partner sessions
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

  // Username check: timing-safe comparison
  const usernameMatch =
    username.length === validUsername.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(validUsername))

  if (!usernameMatch) return false

  // Password check: supports two formats.
  // 1. Hash format "scrypt:<salt>:<hash>" — production recommendation.
  //    Generate with: node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');const h=c.scryptSync('YOUR_PASSWORD',s,64).toString('hex');console.log('scrypt:'+s+':'+h)"
  // 2. Plaintext fallback — backward compat during transition.
  if (validPassword.startsWith("scrypt:")) {
    const parts = validPassword.split(":")
    if (parts.length !== 3) return false
    const [, salt, storedHash] = parts
    try {
      const derivedHash = crypto.scryptSync(password, salt, 64).toString("hex")
      // Timing-safe comparison on the hex strings
      if (derivedHash.length !== storedHash.length) return false
      return crypto.timingSafeEqual(Buffer.from(derivedHash), Buffer.from(storedHash))
    } catch {
      return false
    }
  }

  // Plaintext fallback (remove once ADMIN_PASSWORD is migrated to scrypt hash)
  const passwordMatch =
    password.length === validPassword.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(validPassword))

  return passwordMatch
}

// ── Partner accounts (read-only investor logins) ────────────────
// The super-admin above is env-based and untouched. Partner accounts live in
// the partner_accounts table, each linked to a pit_partners row.

/** Hash a password for storage: "scrypt:<salt>:<hash>". */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `scrypt:${salt}:${hash}`
}

/** Timing-safe verify of a password against a stored scrypt hash. */
export function verifyPasswordHash(password: string, stored: string): boolean {
  if (!stored?.startsWith("scrypt:")) return false
  const parts = stored.split(":")
  if (parts.length !== 3) return false
  const [, salt, storedHash] = parts
  try {
    const derived = crypto.scryptSync(password, salt, 64).toString("hex")
    return derived.length === storedHash.length &&
      crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(storedHash))
  } catch {
    return false
  }
}

/**
 * Verify a partner login. Email is matched case-insensitively (stored
 * lowercased). Returns the linked partnerId on success, else null.
 */
export async function verifyPartner(email: string, password: string): Promise<{ partnerId: string } | null> {
  const supabase = await createAdminClient()
  const { data } = await supabase
    .from("partner_accounts")
    .select("partner_id, password_hash, is_active")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle()
  if (!data || !data.is_active) return null
  if (!verifyPasswordHash(password, data.password_hash as string)) return null
  return { partnerId: String(data.partner_id) }
}

export async function createSession(username: string, role: "admin" | "partner" = "admin", partnerId?: string): Promise<void> {
  const cookieStore = await cookies()
  const now = Date.now()

  const session: AdminSession = {
    username,
    loginAt: now,
    expiresAt: now + SESSION_DURATION,
    role,
    ...(partnerId ? { partnerId } : {}),
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
