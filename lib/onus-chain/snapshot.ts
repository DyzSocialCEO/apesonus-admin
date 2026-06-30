/**
 * lib/onus-chain/snapshot.ts — the "batch" half of the proof layer.
 *
 * Turns a period's plays into a Merkle root, and a state slice (Embers
 * balances) into a digest hash. The anchor cron chains these together and posts the
 * result on-chain via commit.ts. Pure hashing — no network, no secrets — so it
 * runs anywhere and is trivially reproducible by a verifier.
 */

import { sha256Hex, canonical } from "./commit"

export interface PlayLeaf {
  id: string | number
  user_id: string | null
  track_id: string | number | null
  played_at: string
}

/** One leaf per play: a hash of its canonical record. Order-independent inputs,
 *  order-fixed tree (we sort leaves so the root is deterministic). */
export function leafForPlay(p: PlayLeaf): string {
  return sha256Hex(canonical({ id: p.id, user_id: p.user_id, track_id: p.track_id, played_at: p.played_at }))
}

/** Standard binary Merkle root. Odd nodes duplicate the last leaf. Empty set
 *  hashes to the hash of "" so a quiet period still produces a stable root. */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("")
  let level = leaves.slice().sort() // deterministic regardless of fetch order
  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]
      const b = i + 1 < level.length ? level[i + 1] : level[i]
      next.push(sha256Hex(a + b))
    }
    level = next
  }
  return level[0]
}

/** Build the Merkle root for a set of plays. */
export function playsRoot(plays: PlayLeaf[]): string {
  return merkleRoot(plays.map(leafForPlay))
}

/** Hash an arbitrary state slice (e.g. Ember balances) deterministically. */
export function stateDigest(rows: unknown): string {
  return sha256Hex(canonical(rows))
}
