/**
 * lib/onus-chain/anon.ts — stable anonymous handles.
 *
 * Every user gets a consistent public handle derived from their user_id, e.g.
 * "ape_7f3c". It is:
 *   - STABLE: same user_id always maps to the same handle, so a track record
 *     follows them across seasons and on-chain anchors.
 *   - OPAQUE: a one-way hash — reveals nothing about email, username, or id.
 *
 * Rule: email and username NEVER go on-chain or onto any public surface. The
 * anon handle is the only identity that is ever anchored or shown publicly.
 * Anonymity is the default; a user may separately opt in to display a name on
 * leaderboards, but that opt-in name is a private-DB display choice and is not
 * what gets hashed into the chain.
 */

import { createHash } from "node:crypto"

/**
 * Derive the stable public handle for a user_id.
 * Format: ape_<first 6 hex of sha256(user_id)>  e.g. "ape_7f3c9a".
 * 6 hex chars = 16.7M space — plenty to be collision-safe at this scale while
 * staying short and readable.
 */
export function anonHandle(userId: string): string {
  const h = createHash("sha256").update(String(userId)).digest("hex")
  return "ape_" + h.slice(0, 6)
}
