/**
 * lib/onus-chain/rewards-ledger.ts — anchor the rewards ledger on-chain.
 *
 * Snapshots every settled Co-Sign week (with its payouts), strips every user_id
 * to an anon handle, hashes the canonical record, posts the hash to Solana via
 * SPL Memo (APESONUS:commit:rewards:<hash>), and stores the anchor in
 * pit_rewards_anchors. Anyone can then verify that settlements were recorded
 * when they happened and never altered after the fact.
 *
 * (Golden Ticket was retired with the economy pivot; only Co-Sign / Backing
 * settlements are anchored here now.)
 *
 * Best-effort on the chain post (signature null on failure); the anchor row is
 * always stored so the ledger history is continuous. Rides the anchor cron as
 * a side anchor — it never touches the main play-chain commit.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { hashDataset, commitHash } from "./commit"
import { anonHandle } from "./anon"

export async function anchorRewardsLedger(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; hash?: string; signature?: string | null; reason?: string }> {
  try {
    const asOf = new Date().toISOString()

    // ── Co-Sign: settled weeks + their payouts ──
    const { data: weeks } = await supabase
      .from("pit_cosign_pools")
      .select("week_start, sponsor_name, reward_currency, total_pool_value, pool_spins, settled_at")
      .eq("status", "settled")
      .order("week_start", { ascending: false })
      .limit(12)
    const weekKeys = (weeks || []).map((w: any) => w.week_start)

    let cosignRewards: any[] = []
    if (weekKeys.length) {
      const { data } = await supabase
        .from("pit_cosign_rewards")
        .select("week_start, user_id, artist_id, position, reward_kind, currency, value, spins")
        .in("week_start", weekKeys)
        .limit(5000)
      cosignRewards = data || []
    }
    const rewardsByWeek: Record<string, any[]> = {}
    for (const r of cosignRewards) {
      ;(rewardsByWeek[r.week_start] ||= []).push({
        handle: anonHandle(r.user_id),
        artist: r.artist_id,
        position: r.position,
        kind: r.reward_kind,
        currency: r.currency,
        value: Number(r.value) || 0,
        spins: Number(r.spins) || 0,
      })
    }

    // ── Cumulative totals (all-time, for public reconciliation) ──
    // Spins paid out across every settled Co-Sign week — the "out" side of the
    // pool conservation identity shown on /proof.
    let spinsPaid = 0
    for (const r of cosignRewards) spinsPaid += Number(r.spins) || 0

    const record = {
      kind: "rewards_ledger",
      as_of: asOf,
      totals: {
        spins_paid: spinsPaid,
        reward_records: cosignRewards.length,
      },
      cosign_weeks: (weeks || []).map((w: any) => ({
        week_start: w.week_start,
        sponsor: w.sponsor_name,
        currency: w.reward_currency,
        pool: Number(w.total_pool_value) || 0,
        spins_pot: Number(w.pool_spins) || 0,
        settled_at: w.settled_at,
        payouts: rewardsByWeek[w.week_start] || [],
      })),
    }

    const { canonical, hash } = hashDataset(record)
    let signature: string | null = null
    try {
      const anchor = await commitHash("rewards", record) // posts APESONUS:commit:rewards:<hash>
      signature = anchor?.signature || null
    } catch (e) {
      console.error("[rewards-ledger] chain post failed:", (e as Error).message)
    }

    const cluster =
      (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet")
        ? "devnet"
        : "mainnet-beta"

    await supabase.from("pit_rewards_anchors").insert({
      as_of: asOf,
      summary: {
        cosign_weeks: (weeks || []).length,
        spins_paid: spinsPaid,
      },
      commit_hash: hash,
      commit_canonical: canonical,
      signature,
      rpc_cluster: signature ? cluster : null,
    })

    return { ok: true, hash, signature }
  } catch (e) {
    console.error("[rewards-ledger]", (e as Error).message)
    return { ok: false, reason: (e as Error).message }
  }
}
