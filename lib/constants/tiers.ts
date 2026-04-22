/**
 * lib/constants/tiers.ts
 *
 * Only one export is used by the admin after Phase 4.5 Wave 1
 * cleanup: ONUS_SUPPLY, consumed by app/api/admin/onus/route.ts for
 * the supply overview card.
 *
 * Everything else in this file previously supported dead features
 * (Founders Pass, Genesis window, Boost catalog, Arena multipliers,
 * Forecast rewards, tier cards, etc) and was removed in commits
 * C1-admin / C2-admin / C3-admin when the underlying pages and API
 * routes were deleted. The file is intentionally kept as a plain
 * constants module rather than deleted outright so that any existing
 * import path (@/lib/constants/tiers) continues to resolve.
 */

export const ONUS_SUPPLY = {
  TOTAL:        10_000_000_000,
  USER_POOL:     8_000_000_000,
  TEAM_RESERVE:  2_000_000_000,
} as const
