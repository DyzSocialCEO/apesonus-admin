/**
 * APESONUS — Founders Pass Economic Model
 *
 * Two states:
 *   free   → 0.25× base reward rate, full catalog, ads (when live), no Stars pool
 *   wagmi  → 2× base reward rate, ad-free, 100 $ONUS daily auto-grant, Stars pool eligible
 *
 * Unlock: 750 Stars one-time, permanent. Mints Genesis Badge if within 45-day window.
 * Boosts: consumables that multiply the BASE rate (base × active boost).
 *   Free user with 2× SURGE: 0.25 × 2 = 0.5×
 *   WAGMI with 3× MEGA SURGE: 2 × 3 = 6×
 *   Multiple active boosts: only the HIGHEST multiplier applies.
 */

// ── User state ──
export type UserTier = "free" | "wagmi"

// ── Base multipliers ──
export const BASE_MULTIPLIERS: Record<UserTier, number> = {
  free: 0.25,
  wagmi: 2.0,
} as const

// ── Founders Pass ──
export const FOUNDERS_PASS_PRICE_STARS = 750
export const FOUNDERS_PASS_NAME = "Founders Pass"

// ── Genesis window ──
export const GENESIS_WINDOW_DAYS = 45
export const TOP_FOUNDER_THRESHOLD = 100 // first 100 holders get special marker

// ── Daily grant ──
export const WAGMI_DAILY_GRANT = 100
export const DAILY_GRANT_INTERVAL_HOURS = 24

// ── Boost catalog defaults (source of truth is the DB boost_catalog table) ──
export type BoostKind = "multiplier" | "single_use"
export type SingleUseType = "predict_insurance" | "arena_retry"

export interface BoostDefinition {
  slug: string
  name: string
  description: string
  multiplier: number | null
  durationHours: number | null
  starsPrice: number
  kind: BoostKind
  singleUseType: SingleUseType | null
  sortOrder: number
}

export const BOOST_CATALOG_DEFAULTS: BoostDefinition[] = [
  {
    slug: "surge_2x_24h",
    name: "SURGE",
    description: "2× $ONUS for 24 hours on everything you do",
    multiplier: 2.0,
    durationHours: 24,
    starsPrice: 50,
    kind: "multiplier",
    singleUseType: null,
    sortOrder: 10,
  },
  {
    slug: "mega_3x_24h",
    name: "MEGA SURGE",
    description: "3× $ONUS for 24 hours — maximum rate",
    multiplier: 3.0,
    durationHours: 24,
    starsPrice: 100,
    kind: "multiplier",
    singleUseType: null,
    sortOrder: 20,
  },
  {
    slug: "weekend_2x_72h",
    name: "WEEKEND WARRIOR",
    description: "2× $ONUS for 72 hours — Fri through Mon",
    multiplier: 2.0,
    durationHours: 72,
    starsPrice: 120,
    kind: "multiplier",
    singleUseType: null,
    sortOrder: 30,
  },
  {
    slug: "predict_insurance",
    name: "PREDICT INSURANCE",
    description: "Refunds your prediction bonus if you call it wrong",
    multiplier: null,
    durationHours: null,
    starsPrice: 30,
    kind: "single_use",
    singleUseType: "predict_insurance",
    sortOrder: 40,
  },
  {
    slug: "arena_retry",
    name: "ARENA RETRY",
    description: "Retry one Arena challenge you already lost",
    multiplier: null,
    durationHours: null,
    starsPrice: 25,
    kind: "single_use",
    singleUseType: "arena_retry",
    sortOrder: 50,
  },
]

// ── Core multiplier functions ──

/**
 * Get the BASE multiplier for a tier (no boosts applied).
 * Free users: 0.25×. WAGMI: 2×.
 */
export function getBaseMultiplier(tier: UserTier | string | null | undefined): number {
  if (tier === "wagmi") return BASE_MULTIPLIERS.wagmi
  return BASE_MULTIPLIERS.free
}

/**
 * Compute the EFFECTIVE multiplier for a reward: base × active boost.
 * Pass boostMultiplier=null (or 1) when no boost is active.
 * Multiple boosts should NOT be passed here — resolve highest upstream.
 */
export function getEffectiveMultiplier(
  tier: UserTier | string | null | undefined,
  boostMultiplier: number | null | undefined
): number {
  const base = getBaseMultiplier(tier)
  if (!boostMultiplier || boostMultiplier <= 1) return base
  return base * boostMultiplier
}

/**
 * Legacy resolver kept for backward compat with older call sites.
 * Reads the cached onus_multiplier column OR falls back to base tier rate.
 * Does NOT include boosts — callers that need boosts must use getEffectiveMultiplier().
 */
export function resolveMultiplier(
  dbMultiplier: number | null | undefined,
  tier: string | null | undefined
): number {
  if (typeof dbMultiplier === "number" && dbMultiplier > 0) return dbMultiplier
  return getBaseMultiplier(tier)
}

// ── ONUS SUPPLY ──
export const ONUS_SUPPLY = {
  TOTAL: 10_000_000_000,
  USER_POOL: 8_000_000_000,
  TEAM_RESERVE: 2_000_000_000,
} as const

// ── STREAK REWARDS ──
const STREAK_BASE = [250, 300, 350, 500]

export function getStreakReward(completedStreaks: number, multiplier: number): number {
  const idx = Math.min(completedStreaks, STREAK_BASE.length - 1)
  return Math.round(STREAK_BASE[idx] * multiplier)
}

// ── MOOD VOTE REWARDS ──
const MOOD_VOTE_BASE = 15

export function getMoodVoteReward(multiplier: number): number {
  return Math.round(MOOD_VOTE_BASE * multiplier)
}

// ── FORECAST REWARDS ──
export const FORECAST_REWARDS = {
  PARTICIPATION: 100,
  CORRECT_PICK: 1_000,
  GRAND_PRIZE_POOL: 1_000_000,
  GRAND_PRIZE_STARS: 10_000,
} as const

const FORECAST_CORRECT_BASE = 100

export function getForecastReward(isCorrect: boolean, multiplier: number): number {
  if (multiplier <= 0) return 0
  return isCorrect ? FORECAST_CORRECT_BASE * multiplier : 0
}

export function calculateForecastV2Reward(
  correctCount: number,
  perfectOrder: boolean,
  multiplier: number,
  perfectOrderWinners: number
): { pickReward: number; grandPrizeShare: number; total: number } {
  const pickReward = correctCount * FORECAST_REWARDS.CORRECT_PICK * Math.max(multiplier, 0)
  const grandPrizeShare = perfectOrder && perfectOrderWinners > 0
    ? Math.floor(FORECAST_REWARDS.GRAND_PRIZE_POOL / perfectOrderWinners)
    : 0
  return { pickReward, grandPrizeShare, total: pickReward + grandPrizeShare }
}

// ── LEGACY EXPORTS kept for backward compatibility ──
// Old code may still import these; they now just point at the new model.

export type VerificationTier = UserTier | "whale" | "chad" | "ngmi" | "genesis" | "early" | "standard"
export type TierOrFree = VerificationTier

export const TIER_MULTIPLIERS: Record<string, number> = BASE_MULTIPLIERS

export const TIER_LABELS: Record<string, string> = {
  wagmi: "WAGMI",
  free:  "Free",
}

export const TIER_CARD_NAMES: Record<string, string> = {
  wagmi: "WAGMI",
}

export const TIER_CARD_COLORS: Record<string, { bg: string; border: string; label: string; name: string }> = {
  wagmi: { bg: "rgba(255,200,71,0.15)", border: "rgba(255,200,71,0.5)", label: "#ffc847", name: "Gold" },
}

export const TIER_BADGES: Record<string, string> = {
  wagmi: "⚡",
  free:  "",
}

/** @deprecated Legacy shim — Founders Pass is a single 750 Stars one-time price. */
export const TIER_PRICES: Record<string, { amount: number; label: string; currency: string; usd: number; recurring: boolean }> = {
  wagmi: { amount: FOUNDERS_PASS_PRICE_STARS, label: "Stars", currency: "XTR", usd: 0, recurring: false },
}

export function getMultiplier(tier: UserTier | null | undefined): number {
  return getBaseMultiplier(tier)
}

export function getBattleRewardMultiplier(tier: UserTier): number {
  return getBaseMultiplier(tier)
}

// Dead exports from migration 017 era — kept as empty objects so old imports don't crash
export const TIER_CAPS = { GENESIS: 0, EARLY: 0 } as const
export const TIER_COMPANION_LIMITS = { wagmi: 100, free: 5 } as const
export const TIER_DESCRIPTIONS = {
  wagmi: "Founders Pass. 2× $ONUS on everything, 100 $ONUS daily, ad-free, Stars pool eligible.",
  free:  "Full app access at 0.25× reward rate. Unlock WAGMI to multiply everything.",
} as const

/** @deprecated Under Founders Pass model, all paid users become wagmi directly. */
export function assignTier(_totalVerifiedCount: number): UserTier {
  return "wagmi"
}
