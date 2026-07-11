import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { fetchTokenState } from "@/lib/conviction/feed"
import { commitHash } from "@/lib/onus-chain/commit"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * GET /api/cron/conviction-resolve
 *
 * The judge, on a timer. Each run:
 *   1. conviction_tick() — locks boards that closed with calls, voids empty ones.
 *   2. For every DUE snapshot (24h * day since lock, not yet taken): one fresh
 *      Moralis read per distinct token, then conviction_record_snapshot() judges
 *      every alive call on that token (floor breach any day; final bar on day N).
 *      A failed read skips that token this pass and retries next run.
 *   3. Anchors the batch of new snapshots on-chain (SPL Memo, anonymized —
 *      contest/token/day/mcap/liq, no user ids), stamping batch_hash/batch_tx.
 *   4. Settles any locked contest whose full window has elapsed and has no
 *      unjudged calls — queues one payout per winner (nobody cut; per head =
 *      min(target, pot/winners)).
 *
 * Schedule every ~30 min. Idempotent throughout: snapshots are unique per
 * (contest, token, day), settle guards on status. Auth: CRON_SECRET.
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

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    // 1. Lifecycle.
    const { data: tick } = await supabase.rpc("conviction_tick")

    // 2. Due snapshots, one read per distinct (contest, token, day).
    const { data: due } = await supabase
      .from("conviction_due_snapshots")
      .select("contest_id, token_mint, day_index")
      .limit(120)

    let taken = 0, skipped = 0
    const fresh: any[] = []
    for (const row of due || []) {
      const state = await fetchTokenState(row.token_mint)
      if (!state) { skipped++; continue }
      const { data: res } = await supabase.rpc("conviction_record_snapshot", {
        p_contest: row.contest_id, p_token: row.token_mint, p_day: row.day_index,
        p_mcap: state.mcap, p_liquidity: state.liquidity,
        p_lp_ok: state.lpOk, p_auth_ok: state.authorityOk,
      })
      if ((res as any)?.inserted) {
        taken++
        fresh.push({ contest: row.contest_id, token: row.token_mint, day: row.day_index,
                     mcap: Math.round(state.mcap), liq: Math.round(state.liquidity) })
      }
    }

    // 3. Anchor the batch of NEW snapshots (anonymized; no user ids).
    let anchored = false
    if (fresh.length > 0) {
      const res = await commitHash("conviction-snapshots", { at: new Date().toISOString(), snaps: fresh })
      if (res) {
        anchored = true
        for (const f of fresh) {
          await supabase.from("conviction_snapshots")
            .update({ batch_hash: res.hash, batch_tx: res.signature })
            .eq("contest_id", f.contest).eq("token_mint", f.token).eq("day_index", f.day)
            .is("batch_hash", null)
        }
      }
    }

    // 4. Settle any locked contest whose window has fully elapsed.
    const nowIso = new Date().toISOString()
    const { data: ripe } = await supabase
      .from("conviction_contests")
      .select("id, closes_at, days")
      .eq("status", "locked")
    const settled: any[] = []
    for (const c of ripe || []) {
      const windowEnd = new Date(new Date(c.closes_at).getTime() + c.days * 86400000)
      if (windowEnd.toISOString() > nowIso) continue
      const { data: s } = await supabase.rpc("conviction_settle_contest", { p_contest: c.id })
      if ((s as any)?.ok) settled.push({ contest: c.id, ...(s as any) })
    }

    return NextResponse.json({
      ok: true, tick, snapshots_taken: taken, snapshots_skipped: skipped,
      anchored, settled,
    })
  } catch (e: any) {
    console.error("[conviction-resolve]", e?.message || e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
