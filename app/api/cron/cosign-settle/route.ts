import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { captureDrawSeed } from "@/lib/draw-seed"
import { commitHash } from "@/lib/onus-chain/commit"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/cosign-settle
 *
 * Settles every backing round that has closed but is still open (status 'set',
 * closes_at in the past). For each round it runs the same end-to-end flow the
 * Backing Desk "Settle now" button uses — public Solana blockhash seed ->
 * pit_cosign_settle -> on-chain entrant seal — so an auto-settled round carries
 * the exact same proof as a hand-settled one. Idempotent: a settled round is
 * never picked up again. Schedule every ~5 min so both short test rounds and the
 * weekly round settle promptly after they close.
 *
 * Auth: CRON_SECRET via ?secret= or x-admin-secret header, timing-safe.
 * Optional ?week=YYYY-MM-DD to force one round.
 */
function authed(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(request.url)
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret") || ""
  if (!provided) return false
  const a = Buffer.from(provided), b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try { return crypto.timingSafeEqual(a, b) } catch { return false }
}

// One round, end to end — mirrors POST /api/admin/cosign/settle exactly.
async function settleRound(supabase: any, week: string) {
  // 1 + 2: capture the provably-fair public seed, then run the draw.
  const seed = await captureDrawSeed()
  const { data: result, error } = await supabase.rpc("pit_cosign_settle", { p_week: week, p_seed: seed?.seed ?? null })
  if (error) return { week, ok: false, error: error.message }
  if (seed) await supabase.from("pit_cosign_pools").update({ seed_slot: seed.slot }).eq("week_start", week)

  // 3: seal the frozen entrant list on-chain (the draw stays valid even if this fails).
  let sealed: { hash: string; signature: string } | null = null
  try {
    const { data: pool } = await supabase
      .from("pit_cosign_pools").select("draw_summary, draw_seed, seed_slot").eq("week_start", week).maybeSingle()
    const ds = pool?.draw_summary || {}
    if (ds.winner && Array.isArray(ds.entrants) && ds.entrants.length > 0) {
      sealed = await commitHash("backing-draw", {
        round: week, winner: ds.winner, seed: pool?.draw_seed, seed_slot: pool?.seed_slot,
        entrants: ds.entrants.map((e: any) => ({ handle: e.handle, seq: e.seq })),
        winners: ds.entrants.filter((e: any) => e.place).map((e: any) => ({ handle: e.handle, place: e.place, cash: e.cash })),
      })
      if (sealed) {
        await supabase.from("pit_cosign_pools").update({ entrant_hash: sealed.hash, entrant_tx: sealed.signature }).eq("week_start", week)
      }
    }
  } catch (e) {
    console.error("[cron/cosign-settle] seal failed (draw still valid):", (e as Error).message)
  }

  return { week, ok: true, seeded: !!seed, sealed: !!sealed, result }
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const one = new URL(request.url).searchParams.get("week")

    let weeks: string[] = []
    if (one && /^\d{4}-\d{2}-\d{2}$/.test(one)) weeks = [one]
    else {
      const { data } = await supabase
        .from("pit_cosign_pools").select("week_start")
        .eq("status", "set").lte("closes_at", new Date().toISOString())
      weeks = (data || []).map((p: any) => p.week_start)
    }

    const results = []
    for (const week of weeks) results.push(await settleRound(supabase, week))
    return NextResponse.json({ ok: true, settled: weeks.length, results })
  } catch (e: any) {
    console.error("[cron/cosign-settle]", e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
