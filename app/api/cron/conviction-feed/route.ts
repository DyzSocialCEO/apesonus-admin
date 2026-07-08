import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { fetchFreshLaunches, eligibleForBoard } from "@/lib/conviction/feed"
import { commitHash } from "@/lib/onus-chain/commit"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * GET /api/cron/conviction-feed
 *
 * The launch-feed engine. For every OPEN contest whose board window is live
 * (now < closes_at), pulls the freshest Pump.fun launches from Moralis
 * (bonding + new feeds), applies the board gauntlet frozen on the contest —
 * launched after the board opened, mcap under the call ceiling, liquidity at
 * or above the floor — and upserts qualifiers into conviction_board. This
 * board is the ONLY pool a player can call from; nothing is ever hand-added.
 *
 * First sighting freezes mcap_at_add / liquidity_at_add; every later pass
 * refreshes last_mcap / last_liquidity / last_seen_at so the Desk (and later
 * the player board) shows near-live numbers without ever mutating the frozen
 * add-time record. Tokens that later cross the ceiling are NOT deleted — the
 * Phase 2 entry RPC re-validates the live mcap at call time, which is the
 * check that actually matters.
 *
 * SECOND DUTY — the call sealer. Every run also picks up any conviction
 * calls that haven't been sealed yet (seal_hash NULL, bounded batch) and
 * anchors each on-chain via the commit engine (SPL Memo). The seal preimage
 * is fully public — { contest, call_id, token, entry_mcap, entry_price,
 * spins, ts } — no user identifiers, so anyone can verify a call was made
 * when and at what mcap without learning who made it. A call is VALID the
 * moment the entry RPC returns; the seal is tamper-evidence, so a failed
 * seal attempt just retries next run.
 *
 * Schedule on cron-job.org every 3–5 min. Idempotent; a run with no open
 * contests and no unsealed calls is a fast no-op that never touches Moralis.
 *
 * Auth: CRON_SECRET via ?secret= or x-admin-secret header, timing-safe.
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
    const nowIso = new Date().toISOString()

    // ── Duty 2 first (cheap): seal any unsealed calls ──
    let sealed = 0, sealErrors = 0
    {
      const { data: unsealed } = await supabase
        .from("conviction_calls")
        .select("id, contest_id, token_mint, entry_mcap, entry_price, spins_paid, entry_ts")
        .is("seal_hash", null)
        .order("created_at", { ascending: true })
        .limit(20)
      for (const call of unsealed || []) {
        try {
          const res = await commitHash("conviction-call", {
            contest: call.contest_id, call_id: call.id, token: call.token_mint,
            entry_mcap: Number(call.entry_mcap), entry_price: Number(call.entry_price),
            spins: Number(call.spins_paid), ts: call.entry_ts,
          })
          if (res) {
            await supabase.from("conviction_calls")
              .update({ seal_hash: res.hash, seal_tx: res.signature })
              .eq("id", call.id).is("seal_hash", null)
            sealed++
          } else sealErrors++
        } catch (e) { console.error("[conviction-seal]", call.id, e); sealErrors++ }
      }
    }

    // ── Duty 1: fill open boards ──
    const { data: contests, error: cErr } = await supabase
      .from("conviction_contests")
      .select("id, opens_at, closes_at, call_ceiling_mcap, liq_floor_usd")
      .eq("status", "open")
      .gt("closes_at", nowIso)
    if (cErr) throw cErr
    if (!contests?.length) return NextResponse.json({ ok: true, contests: 0, sealed, seal_errors: sealErrors, note: "no open boards" })

    // One Moralis pull serves every open contest.
    const launches = await fetchFreshLaunches()

    const results: any[] = []
    for (const c of contests) {
      const qualifying = launches.filter((t) =>
        eligibleForBoard(t, { opens_at: c.opens_at, call_ceiling_mcap: Number(c.call_ceiling_mcap), liq_floor_usd: Number(c.liq_floor_usd) })
      )

      let added = 0, refreshed = 0
      for (const t of qualifying) {
        // Freeze add-time numbers on first sighting; refresh live numbers after.
        const { data: existing } = await supabase
          .from("conviction_board").select("id")
          .eq("contest_id", c.id).eq("token_mint", t.mint).maybeSingle()

        if (!existing) {
          const { error } = await supabase.from("conviction_board").insert({
            contest_id: c.id, token_mint: t.mint, symbol: t.symbol, name: t.name, logo: t.logo,
            launch_ts: t.createdAt, mcap_at_add: t.mcap, liquidity_at_add: t.liquidity,
            last_mcap: t.mcap, last_liquidity: t.liquidity, last_seen_at: nowIso,
            lp_ok: true, authority_ok: true, source: t.source,
          })
          if (!error) added++
        } else {
          const { error } = await supabase.from("conviction_board")
            .update({ last_mcap: t.mcap, last_liquidity: t.liquidity, last_seen_at: nowIso })
            .eq("id", existing.id)
          if (!error) refreshed++
        }
      }

      // Also refresh live numbers for board tokens still in the feed but no
      // longer qualifying (e.g. crossed the ceiling) so the Desk shows why.
      const qualMints = new Set(qualifying.map((t) => t.mint))
      const feedByMint = new Map(launches.map((t) => [t.mint, t]))
      const { data: boardRows } = await supabase
        .from("conviction_board").select("id, token_mint").eq("contest_id", c.id)
      for (const row of boardRows || []) {
        if (qualMints.has(row.token_mint)) continue
        const live = feedByMint.get(row.token_mint)
        if (!live) continue
        await supabase.from("conviction_board")
          .update({ last_mcap: live.mcap, last_liquidity: live.liquidity, last_seen_at: nowIso })
          .eq("id", row.id)
        refreshed++
      }

      results.push({ contest: c.id, scanned: launches.length, qualifying: qualifying.length, added, refreshed })
    }

    return NextResponse.json({ ok: true, contests: contests.length, sealed, seal_errors: sealErrors, results })
  } catch (e: any) {
    console.error("[cron/conviction-feed]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
