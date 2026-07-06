/**
 * lib/onus-chain/rewards-ledger.ts — anchor the rewards ledger on-chain.
 *
 * Snapshots every settled Golden Ticket campaign (with its drawn winners) and
 * every settled Co-Sign week (with its payouts), strips every user_id to an
 * anon handle, hashes the canonical record, posts the hash to Solana via SPL
 * Memo (APESONUS:commit:rewards:<hash>), and stores the anchor in
 * pit_rewards_anchors. Anyone can then verify that draws and settlements were
 * recorded when they happened and never altered after the fact.
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

    // ── Golden Ticket: settled/void campaigns + their drawn winners ──
    const { data: campaigns } = await supabase
      .from("pit_gt_campaigns")
      .select("id, sponsor_name, reward_currency, total_pool_value, spins_pot, activation_threshold, starts_at, ends_at, status, settled_at, draw_summary")
      .in("status", ["settled", "void"])
      .order("settled_at", { ascending: false })
      .limit(20)
    const campaignIds = (campaigns || []).map((c: any) => c.id)

    let winners: any[] = []
    if (campaignIds.length) {
      const { data } = await supabase
        .from("pit_golden_tickets")
        .select("campaign_id, user_id, place, reward_currency, value, status")
        .in("campaign_id", campaignIds)
        .order("campaign_id", { ascending: false })
        .limit(2000)
      winners = data || []
    }
    const winnersByCampaign: Record<number, any[]> = {}
    for (const w of winners) {
      ;(winnersByCampaign[w.campaign_id] ||= []).push({
        handle: anonHandle(w.user_id),
        place: w.place,
        currency: w.reward_currency,
        value: Number(w.value) || 0,
        status: w.status,
      })
    }

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
    const { data: allTickets } = await supabase
      .from("pit_golden_tickets")
      .select("reward_currency, value, status")
      .limit(10000)
    const cashByCurrency: Record<string, number> = {}
    let spinsCredited = 0
    for (const t of allTickets || []) {
      const v = Number(t.value) || 0
      if (t.reward_currency === "spins") spinsCredited += v
      else if (["won", "pending_payout", "paid"].includes(t.status)) {
        cashByCurrency[t.reward_currency] = (cashByCurrency[t.reward_currency] || 0) + v
      }
    }

    const record = {
      kind: "rewards_ledger",
      as_of: asOf,
      totals: {
        cash_awarded: cashByCurrency,
        spins_credited: spinsCredited,
        reward_records: (allTickets || []).length,
      },
      gt_campaigns: (campaigns || []).map((c: any) => ({
        id: c.id,
        sponsor: c.sponsor_name,
        currency: c.reward_currency,
        pool: Number(c.total_pool_value) || 0,
        spins_pot: Number(c.spins_pot) || 0,
        threshold: c.activation_threshold,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        status: c.status,
        settled_at: c.settled_at,
        draw_summary: c.draw_summary,
        winners: winnersByCampaign[c.id] || [],
      })),
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
        gt_campaigns: (campaigns || []).length,
        cosign_weeks: (weeks || []).length,
        cash_awarded: cashByCurrency,
        spins_credited: spinsCredited,
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
