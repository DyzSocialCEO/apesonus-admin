/**
 * APESONUS Admin — Upstash Redis + Rate Limit Helpers
 *
 * Reuses the same Upstash Redis credentials the main app uses
 * (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 *
 * Falls back to in-memory rate limiting if Upstash env vars are missing.
 * This means local development works without Upstash, but production
 * SHOULD set these vars so state persists across Railway deploys and
 * multiple container instances.
 *
 * IMPORTANT — module-eval ordering note:
 * All non-trivial init is done LAZILY. Top-level `export const` statements
 * that synchronously call factories cause webpack TDZ errors during Next.js
 * page data collection. Everything in this file is either pure type/class
 * definitions, or functions that defer initialization until first call.
 */

import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"

// ── Types ────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimiterLike {
  limit(key: string): Promise<RateLimitResult>
}

// ── In-memory fallback class (declared FIRST so it's available to factories) ──

class InMemoryRateLimiter implements RateLimiterLike {
  private store = new Map<string, RateLimitEntry>()
  private maxRequests: number
  private windowMs: number

  constructor(opts: { maxRequests: number; windowMs: number; prefix?: string }) {
    this.maxRequests = opts.maxRequests
    this.windowMs = opts.windowMs
  }

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - this.windowMs
    let entry = this.store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(key, entry)
    }
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart)
    if (entry.timestamps.length >= this.maxRequests) {
      return {
        success: false,
        limit: this.maxRequests,
        remaining: 0,
        reset: entry.timestamps[0] + this.windowMs,
      }
    }
    entry.timestamps.push(now)
    return {
      success: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - entry.timestamps.length,
      reset: now + this.windowMs,
    }
  }
}

// ── Redis client (lazy singleton) ────────────────────────────────

let _redisClient: Redis | null | undefined = undefined

function getRedis(): Redis | null {
  if (_redisClient !== undefined) return _redisClient
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    _redisClient = null
    return null
  }
  try {
    _redisClient = new Redis({ url, token })
    return _redisClient
  } catch {
    _redisClient = null
    return null
  }
}

// ── Rate limiter factories (lazy — no top-level instantiation) ──

const _limiterCache = new Map<string, RateLimiterLike>()

function getLimiter(opts: { maxRequests: number; windowMs: number; prefix: string }): RateLimiterLike {
  const cached = _limiterCache.get(opts.prefix)
  if (cached) return cached

  const r = getRedis()
  let limiter: RateLimiterLike
  if (r) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(opts.maxRequests, `${opts.windowMs}ms`),
      prefix: `admin-rl:${opts.prefix}`,
    })
  } else {
    limiter = new InMemoryRateLimiter(opts)
  }
  _limiterCache.set(opts.prefix, limiter)
  return limiter
}

// Public API: each is a function that lazily resolves the limiter.
// This is the safest pattern for Next.js — no module-eval-time side effects.

export function adminOnusRatelimit() {
  return getLimiter({ maxRequests: 3, windowMs: 60_000, prefix: "onus-mint" })
}

export function adminGeneralRatelimit() {
  return getLimiter({ maxRequests: 60, windowMs: 60_000, prefix: "general" })
}

export function adminLoginRatelimit() {
  return getLimiter({ maxRequests: 5, windowMs: 15 * 60_000, prefix: "login" })
}

// ── Generic async KV helpers for login attempt tracking ──────────

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = getRedis()
  if (!r) return null
  try {
    const val = await r.get(key)
    if (val === null || val === undefined) return null
    return typeof val === "string" ? (JSON.parse(val) as T) : (val as T)
  } catch {
    return null
  }
}

export async function kvSet<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    if (ttlSeconds) {
      await r.set(key, JSON.stringify(value), { ex: ttlSeconds })
    } else {
      await r.set(key, JSON.stringify(value))
    }
  } catch {}
}

export async function kvDelete(key: string): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    await r.del(key)
  } catch {}
}

// ── Helper: extract client IP from a request ─────────────────────

export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return "unknown"
}
