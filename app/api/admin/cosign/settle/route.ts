import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { captureDrawSeed } from "@/lib/draw-seed"
import { commitHash } from "@/lib/onus-chain/commit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/settle   { week? }
 *
 * Runs the draw for a round, end to end:
 *  1. captures a public Solana blockhash as the provably-fair seed
 *  2. pit_cosign_settle(week, seed) → picks the #1 artist, draws the top 5 from
 *     its backers (deterministic from the seed), writes the reward receipts, and
 *     stores the full entrant breakdown (by handle) in draw_summary
 *  3. seals that entrant list on-chain (SPL Memo) so it can't be edited after,
 *     storing the hash + tx signature
 *
 * Idempotent — a settled round no-ops. No body settles the current round.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { week?: string }
  try {
    const supabase = await createAdminClient()
    let week = body.week && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : null
    if (!week) {
      const { data } = await supabase.from("pit_cosign_pools").select("week_start").eq("status", "set").order("closes_at", { ascending: false }).limit(1).maybeSingle()
      week = data?.week_start || null
    }
    if (!week) return NextResponse.json({ error: "No round to settle." }, { status: 400 })

    // 1 + 2: seed + settle
    const seed = await captureDrawSeed()
    const { data: result, error } = await supabase.rpc("pit_cosign_settle", { p_week: week, p_seed: seed?.seed ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (seed) await supabase.from("pit_cosign_pools").update({ seed_slot: seed.slot }).eq("week_start", week)

    // 3: seal the frozen entrant list on-chain
    let sealed: { hash: string; signature: string } | null = null
    try {
      const { data: pool } = await supabase.from("pit_cosign_pools").select("draw_summary, draw_seed, seed_slot").eq("week_start", week).maybeSingle()
      const ds = pool?.draw_summary || {}
      if (ds.winner && Array.isArray(ds.entrants) && ds.entrants.length > 0) {
        sealed = await commitHash("backing-split", {
          round: week, winner: ds.winner, model: ds.model || "skill_split",
          pool_spins: ds.pool_spins, alpha: ds.alpha,
          seed: pool?.draw_seed, seed_slot: pool?.seed_slot,
          entrants: ds.entrants.map((e: any) => ({ handle: e.handle, seq: e.seq, ts: e.ts })),
          winners: ds.entrants.filter((e: any) => e.won || e.place).map((e: any) => ({ handle: e.handle, spins: e.spins ?? e.cash })),
        })
        if (sealed) {
          await supabase.from("pit_cosign_pools").update({ entrant_hash: sealed.hash, entrant_tx: sealed.signature }).eq("week_start", week)
        }
      }
    } catch (e) {
      console.error("[settle] seal failed (draw still valid):", (e as Error).message)
    }

    return NextResponse.json({ ok: true, week, seeded: !!seed, sealed: !!sealed, result })
  } catch (e: any) {
    console.error("[admin/cosign/settle]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
