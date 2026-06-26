/**
 * lib/onus-chain/ammo-ledger.ts — anchor the Ammo supply on-chain.
 *
 * Reads ammo_ledger_snapshot(), strips every user_id to an anon handle (no
 * identity on-chain), hashes the canonical record, posts the hash to Solana,
 * and stores the anchor in pit_ammo_ledger_anchors. Anyone can then verify the
 * supply reconciliation: circulating Ammo vs. (purchased + granted), and see
 * every house grant with its reason — so phantom Ammo is publicly visible.
 *
 * Best-effort on the chain post (signature null on failure); the snapshot row
 * is always stored so the ledger history is continuous.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { hashDataset, commitHash } from "./commit"
import { anonHandle } from "./anon"

interface Holder { user_id: string; balance: number }
interface Grant {
  user_id: string
  amount: number
  reason: string | null
  actor: string | null
  at: string
}
interface LedgerSnapshot {
  kind: string
  as_of: string
  total_circulating: number
  total_purchased: number
  total_granted: number
  accounted_in: number
  implied_spent: number
  usd_cents_in: number
  holders: number
  buyers: number
  grant_count: number
  top_holders: Holder[]
  grants: Grant[]
}

export async function anchorAmmoLedger(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; hash?: string; signature?: string | null; reason?: string }> {
  const { data, error } = await supabase.rpc("ammo_ledger_snapshot", { p_top: 50 })
  if (error || !data) {
    return { ok: false, reason: "snapshot_failed" }
  }

  const snap = data as LedgerSnapshot

  // Anonymize: user_id -> ape_xxxx everywhere before anything is hashed/stored.
  const record = {
    kind: "ammo_ledger",
    as_of: snap.as_of,
    total_circulating: snap.total_circulating,
    total_purchased: snap.total_purchased,
    total_granted: snap.total_granted,
    accounted_in: snap.accounted_in,
    implied_spent: snap.implied_spent,
    usd_cents_in: snap.usd_cents_in,
    holders: snap.holders,
    buyers: snap.buyers,
    grant_count: snap.grant_count,
    top_holders: (snap.top_holders || []).map((h) => ({
      handle: anonHandle(h.user_id),
      balance: h.balance,
    })),
    grants: (snap.grants || []).map((g) => ({
      handle: anonHandle(g.user_id),
      amount: g.amount,
      reason: g.reason,
      actor: g.actor,
      at: g.at,
    })),
  }

  const { canonical, hash } = hashDataset(record)
  let signature: string | null = null
  try {
    const anchor = await commitHash("ammo", record) // posts APESONUS:commit:ammo:<hash>
    signature = anchor?.signature || null
  } catch (e) {
    console.error("[ammo-ledger] chain post failed:", (e as Error).message)
  }

  const cluster =
    (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet")
      ? "devnet"
      : "mainnet-beta"

  await supabase.from("pit_ammo_ledger_anchors").insert({
    as_of: snap.as_of,
    total_circulating: snap.total_circulating,
    total_purchased: snap.total_purchased,
    total_granted: snap.total_granted,
    implied_spent: snap.implied_spent,
    commit_hash: hash,
    commit_canonical: canonical,
    signature,
    rpc_cluster: signature ? cluster : null,
  })

  return { ok: true, hash, signature }
}
