/**
 * APESONUS — Verification Tier System
 *
 * Genesis  → first 10,000 verified  → 3x multiplier → ORIGIN CARD (Gold)
 * Early    → next 65,000 (up to 75K) → 2x multiplier → SIGNAL CARD (Silver)
 * Standard → unlimited, monthly     → 1x multiplier → HOLDER CARD (Bronze)
 * Free     → no verification        → 0x (no $ONUS)
 *
 * Price: 200 Telegram Stars/month for all tiers.
 * Verification is a monthly subscription. The card reflects when you showed up.
 */

export const TIER_CAPS = {
  GENESIS: 10_000,
  EARLY: 75_000,
} as const

export const TIER_MULTIPLIERS = {
  genesis: 3,
  early: 2,
  standard: 1,
  free: 0.25,
} as const

export const TIER_PRICES = {
  genesis:  { amount: 200, label: "Stars", currency: "XTR", recurring: false },
  early:    { amount: 200, label: "Stars", currency: "XTR", recurring: false },
  standard: { amount: 200, label: "Stars", currency: "XTR", recurring: true },
} as const

export const TIER_COMPANION_LIMITS = {
  genesis:  100,
  early:    100,
  standard: 20,
  free:     5,
} as const

export const TIER_LABELS = {
  genesis:  "Genesis",
  early:    "Early",
  standard: "Standard",
  free:     "Free",
} as const

export const TIER_BADGES = {
  genesis:  "🔵",
  early:    "🟢",
  standard: "⚪",
  free:     "",
} as const

// Card names — displayed to users
export const TIER_CARD_NAMES = {
  genesis:  "Genesis Card",
  early:    "Early Card",
  standard: "Standard Card",
} as const

export const TIER_CARD_COLORS = {
  genesis:  { bg: "rgba(255,200,71,0.15)",  border: "rgba(255,200,71,0.5)",  label: "#ffc847", name: "Gold"   },
  early:    { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.5)", label: "#94a3b8", name: "Silver" },
  standard: { bg: "rgba(180,140,100,0.15)", border: "rgba(180,140,100,0.5)", label: "#b48c64", name: "Bronze" },
} as const

export type VerificationTier = "genesis" | "early" | "standard"
export type TierOrFree = VerificationTier | "free"

export function assignTier(totalVerifiedCount: number): VerificationTier {
  if (totalVerifiedCount < TIER_CAPS.GENESIS) return "genesis"
  if (totalVerifiedCount < TIER_CAPS.EARLY)   return "early"
  return "standard"
}

export function getMultiplier(tier: TierOrFree | null | undefined): number {
  if (!tier) return 0.25
  return TIER_MULTIPLIERS[tier] ?? 0.25
}

/**
 * Resolve the actual multiplier for a user.
 * Handles the case where onus_multiplier is 0 in the DB (free users)
 * — the ?? operator doesn't catch 0, so we need explicit logic.
 */
export function resolveMultiplier(dbMultiplier: number | null | undefined, tier: string | null | undefined): number {
  if (typeof dbMultiplier === "number" && dbMultiplier > 0) return dbMultiplier
  return getMultiplier(tier as TierOrFree | null | undefined)
}

// ── ONUS SUPPLY ──
export const ONUS_SUPPLY = {
  TOTAL: 10_000_000_000,       // 10B total (minted at TGE)
  USER_POOL: 8_000_000_000,    // 8B distributed to users
  TEAM_RESERVE: 2_000_000_000, // 2B team reserve
} as const

const STREAK_BASE = [250, 300, 350, 500]

export function getStreakReward(completedStreaks: number, multiplier: number): number {
  const idx = Math.min(completedStreaks, STREAK_BASE.length - 1)
  return Math.round(STREAK_BASE[idx] * multiplier)
}

const MOOD_VOTE_BASE = 15

export function getMoodVoteReward(multiplier: number): number {
  return Math.round(MOOD_VOTE_BASE * multiplier)
}

// ── Forecast v2 rewards ──
export const FORECAST_REWARDS = {
  PARTICIPATION: 100,           // everyone gets this on submission
  CORRECT_PICK: 1_000,          // per correct pick in top 3 (any order) × multiplier
  JACKPOT_POOL: 1_000_000,     // shared among perfect-order winners
  JACKPOT_STARS: 10_000,       // Telegram Stars for perfect order
} as const

// Legacy — kept for backward compat
const FORECAST_CORRECT_BASE = 100

export function getForecastReward(isCorrect: boolean, multiplier: number): number {
  if (multiplier <= 0) return 0
  return isCorrect ? FORECAST_CORRECT_BASE * multiplier : 0
}

// v2: Calculate forecast rewards for a user
export function calculateForecastV2Reward(
  correctCount: number,
  perfectOrder: boolean,
  multiplier: number,
  perfectOrderWinners: number
): { pickReward: number; jackpotShare: number; total: number } {
  // Pick reward: 700 per correct × multiplier (free users earn at 0.25×)
  const pickReward = correctCount * FORECAST_REWARDS.CORRECT_PICK * Math.max(multiplier, 0)

  // Jackpot: split among all perfect-order winners (minimum 1 to avoid /0)
  const jackpotShare = perfectOrder && perfectOrderWinners > 0
    ? Math.floor(FORECAST_REWARDS.JACKPOT_POOL / perfectOrderWinners)
    : 0

  return {
    pickReward,
    jackpotShare,
    total: pickReward + jackpotShare,
  }
}

export function getBattleRewardMultiplier(tier: TierOrFree): number {
  return TIER_MULTIPLIERS[tier as keyof typeof TIER_MULTIPLIERS] ?? 0.25
}
