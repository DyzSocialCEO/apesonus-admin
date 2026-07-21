/**
 * lib/onus-chain/draw-ledger.ts — anchor THE DRAW on-chain.
 *
 * For each settled draw day not yet anchored, take the exact snapshot the SQL
 * already froze into pit_draw_days.summary (the seed + pool + the five anon
 * winners), hash the canonical record, post the hash to Solana via SPL Memo
 * (APESONUS:commit:draw:<hash>), and write the anchor back onto the day row.
 * Anyone can re-hash the published record and match it against the on-chain
 * memo, then re-run the seeded hash-walk from the seed + tickets to confirm the
 * same five names fall out.
 *
 * Winners are already anonymized by the settle (anon_handle); no user_id ever
 * enters this record. Best-effort on the chain post: settle_commit_hash and
 * settle_canonical are always written so the receipt exists and can be
 * re-anchored, and settle_signature/settle_cluster fill in once the tx
 * confirms. Rides the anchor cron as a side anchor; never touches the main
 * play-chain commit.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { hashDataset, commitHash } from "./commit"

interface DrawWinner {
  position: number
  handle: string
  tickets: number
  spins: number
}

export async function anchorDrawLedger(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; anchored: string[]; reason?: string }> {
  const anchored: string[] = []
  try {
    // Settled days that carry a summary but no signature yet. Oldest first so
    // the on-chain order matches the calendar. Batch-capped so one run can't
    // stall on a backlog.
    const { data: days, error } = await supabase
      .from("pit_draw_days")
      .select(
        "day, seed, pool_spins, carry_spins, tickets_total, players_total, summary, settle_signature",
      )
      .eq("status", "settled")
      .is("settle_signature", null)
      .order("day", { ascending: true })
      .limit(20)
    if (error) throw error
    if (!days || days.length === 0) return { ok: true, anchored }

    const cluster = (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet")
      ? "devnet"
      : "mainnet-beta"

    for (const d of days) {
      const summary = (d.summary || {}) as Record<string, unknown>
      const rawWinners = Array.isArray(summary.winners)
        ? (summary.winners as Record<string, unknown>[])
        : []
      const winners: DrawWinner[] = rawWinners
        .map((w) => ({
          position: Number(w.position) || 0,
          handle: String(w.handle || ""),
          tickets: Number(w.tickets) || 0,
          spins: Number(w.spins) || 0,
        }))
        .sort((a, b) => a.position - b.position)

      // The exact record that gets hashed and anchored. canonical() sorts keys,
      // so field order here is irrelevant — the VALUES are what must stay stable
      // so the public re-hash matches.
      const record = {
        kind: "draw",
        day: d.day,
        seed: d.seed,
        pool_spins: Number(d.pool_spins) || 0,
        carry_spins: Number(d.carry_spins) || 0,
        tickets_total: Number(d.tickets_total) || 0,
        players_total: Number(d.players_total) || 0,
        winners,
      }

      const { canonical, hash } = hashDataset(record)
      let signature: string | null = null
      try {
        const anchor = await commitHash("draw", record) // posts APESONUS:commit:draw:<hash>
        signature = anchor?.signature || null
      } catch (e) {
        console.error("[draw-ledger] chain post failed:", (e as Error).message)
      }

      const { error: upErr } = await supabase
        .from("pit_draw_days")
        .update({
          settle_commit_hash: hash,
          settle_canonical: canonical,
          settle_signature: signature,
          settle_cluster: signature ? cluster : null,
        })
        .eq("day", d.day)
      if (upErr) {
        console.error("[draw-ledger] write-back failed for", d.day, upErr.message)
        continue
      }
      if (signature) anchored.push(String(d.day))
    }

    return { ok: true, anchored }
  } catch (e) {
    console.error("[draw-ledger]", (e as Error).message)
    return { ok: false, anchored, reason: (e as Error).message }
  }
}
