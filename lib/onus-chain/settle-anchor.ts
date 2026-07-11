/**
 * lib/onus-chain/settle-anchor.ts — anchor a Read settlement on-chain.
 *
 * After read_pay_winners settles a season by pure formula, we make the result
 * publicly verifiable: take the exact settlement snapshot, replace every
 * user_id with its anon handle (no identity on-chain), hash the canonical
 * record, post the hash to Solana via SPL Memo, and store the anchor on the
 * season row. Anyone can then re-derive the same hash from the public payout
 * data and confirm the split matched the formula — and that the house didn't
 * quietly edit who won or how much.
 *
 * Best-effort by design: if the chain post fails (RPC down, no key), the
 * settlement itself still stands in the DB; we just record signature = null and
 * it can be re-anchored. Settlement money is never blocked on the anchor.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { hashDataset, commitHash } from "./commit"
import { anonHandle } from "./anon"

interface SettlementPayout {
  user_id: string
  rank: number
  points: number
  payout_usd: number
}

interface SettlementSnapshot {
  season_id: string
  pool_usd: number
  total_points: number
  winners: number
  settled_at: string
  payouts: SettlementPayout[]
}

/**
 * Build the anonymized, canonical settlement record and anchor it.
 * Returns { ok, hash, signature } — ok=false only on a snapshot/build error,
 * never merely because the chain post failed (that yields signature=null).
 */
export async function anchorSettlement(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{ ok: boolean; hash?: string; signature?: string | null; reason?: string }> {
  // Pull the exact settlement snapshot the DB froze.
  const { data, error } = await supabase.rpc("read_settlement_snapshot", {
    p_season_id: seasonId,
  })
  if (error || !data) {
    return { ok: false, reason: "snapshot_failed" }
  }

  const snap = data as SettlementSnapshot
  if (!snap.settled_at) {
    return { ok: false, reason: "not_settled" }
  }

  // Anonymize: user_id -> ape_xxxx. Identity never goes on-chain. Order by rank
  // for a deterministic record.
  const anonPayouts = (snap.payouts || [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({
      handle: anonHandle(p.user_id),
      rank: p.rank,
      points: p.points,
      payout_usd: p.payout_usd,
    }))

  const record = {
    kind: "read_settlement",
    season_id: snap.season_id,
    pool_usd: snap.pool_usd,
    total_points: snap.total_points,
    winners: snap.winners,
    settled_at: snap.settled_at,
    payouts: anonPayouts,
  }

  // Hash the canonical record, then post the hash to Solana.
  const { canonical, hash } = hashDataset(record)
  let signature: string | null = null
  try {
    const anchor = await commitHash("read", record) // posts APESONUS:commit:read:<hash>
    signature = anchor?.signature || null
  } catch (e) {
    console.error("[settle-anchor] chain post failed:", (e as Error).message)
  }

  const cluster =
    (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet")
      ? "devnet"
      : "mainnet-beta"

  // Record the anchor on the season so /proof and the admin can show it.
  await supabase
    .from("read_seasons")
    .update({
      settle_commit_hash: hash,
      settle_canonical: canonical,
      settle_signature: signature,
      settle_cluster: signature ? cluster : null,
    })
    .eq("id", seasonId)

  return { ok: true, hash, signature }
}
