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
 */

import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"

// ── Redis client (lazy singleton) ────────────────────────────────

let redisClient: Redis | null = null

export function getRedis(): Redis | null {
  if (redisClient) return redisClient
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    redisClient = new Redis({ url, token })
    return redisClient
  } catch {
    return null
  }
}

// ── Rate limit factory ───────────────────────────────────────────

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

function createRatelimiter(opts: { maxRequests: number; windowMs: number; prefix: string }) {
  const r = getRedis()
  if (r) {
    return new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(opts.maxRequests, `${opts.windowMs}ms`),
      prefix: `admin-rl:${opts.prefix}`,
    })
  }
  return new InMemoryRateLimiter(opts)
}

// Admin rate limiters
export const adminOnusRatelimit = createRatelimiter({
  maxRequests: 3,
  windowMs: 60_000,
  prefix: "onus-mint",
})

export const adminGeneralRatelimit = createRatelimiter({
  maxRequests: 60,
  windowMs: 60_000,
  prefix: "general",
})

export const adminLoginRatelimit = createRatelimiter({
  maxRequests: 5,
  windowMs: 15 * 60_000, // 5 attempts per 15 minutes
  prefix: "login",
})

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

// ── In-memory fallback (only used when Upstash is not configured) ──

interface RateLimitEntry {
  timestamps: number[]
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private maxRequests: number
  private windowMs: number

  constructor(opts: { maxRequests: number; windowMs: number; prefix?: string }) {
    this.maxRequests = opts.maxRequests
    this.windowMs = opts.windowMs
    if (typeof globalThis !== "undefined") {
      const interval = setInterval(() => this.prune(), 60_000)
      if (typeof interval === "object" && "unref" in interval) {
        ;(interval as any).unref()
      }
    }
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

  private prune() {
    const now = Date.now()
    this.store.forEach((entry, key) => {
      entry.timestamps = entry.timestamps.filter((t) => t > now - this.windowMs)
      if (entry.timestamps.length === 0) this.store.delete(key)
    })
  }
}

// ── Helper: extract client IP from a request ─────────────────────

export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return "unknown"
}
