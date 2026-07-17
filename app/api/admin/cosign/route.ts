import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/cosign
 *
 * Backing Desk snapshot: the current round (Spins pool, open/close times,
 * status), the live artist race (artists by total streams in the round window
 * with backing counts), and a settlement preview — if the round closed now,
 * which artist wins and how the timestamp-weighted Spins split would land
 * across its backers (earlier lock = bigger slice). Plus settled-round history.
 */

// Mirror of the settle split: weight = max(1, secs remaining at lock)^alpha,
// integer largest-remainder — so the preview matches the real result exactly.
function previewSplit(rows: { ts: number; seq: number }[], closesAtMs: number, pool: number, alpha: number): number[] {
  const w = rows.map((r) => Math.pow(Math.max(1, Math.floor((closesAtMs - r.ts) / 1000)), alpha))
  const wsum = w.reduce((a, x) => a + x, 0)
  if (!wsum || pool <= 0 || !rows.length) return rows.map(() => 0)
  const base = w.map((x) => Math.floor((pool * x) / wsum))
  const frac = w.map((x, i) => (pool * x) / wsum - base[i])
  let leftover = pool - base.reduce((a, x) => a + x, 0)
  const order = rows.map((r, i) => ({ i, f: frac[i], ts: r.ts, seq: r.seq }))
    .sort((a, b) => b.f - a.f || a.ts - b.ts || a.seq - b.seq)
  for (const o of order) { if (leftover <= 0) break; base[o.i] += 1; leftover-- }
  return base
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    // Current round = latest non-settled pool.
    const { data: round } = await supabase
      .from("pit_cosign_pools").select("*").eq("status", "set").order("closes_at", { ascending: false }).limit(1).maybeSingle()

    let race: any[] = []
    let preview: any = { winner: null, backers: 0 }
    if (round) {
      // COUNTED plays per artist, the same primitive pit_cosign_settle pays on.
      // This used to pull play_history straight, which counted free plays AND
      // capped out at 20k rows, so at any real volume the desk would have been
      // previewing a truncated race. Now it asks the database the same question
      // the settle asks, and the answer cannot drift from the payout.
      const { data: counted } = await supabase.rpc("pit_counted_plays_by_artist", {
        p_from: round.opens_at, p_to: round.closes_at,
      })
      const ROSTER_NAMES: Record<string, string> = {
        "chartnobyl-bro": "Chartnobyl Bro", "coinalisa": "Coinalisa",
        "lola-likwidity": "Lola Likwidity", "mcbagholder": "McBagholder",
        "dj-dustwallet": "DJ Dustwallet", "shilliam-dafoe": "Shilliam Dafoe",
        "satosheek": "Satosheek",
      }
      const streams: Record<string, number> = {}
      for (const row of (counted || []) as { artist_id: string; counted: number }[]) {
        const name = ROSTER_NAMES[row.artist_id]
        if (name) streams[name] = (streams[name] || 0) + (Number(row.counted) || 0)
      }

      const { data: backs } = await supabase.from("pit_cosigns").select("artist_id, seq, created_at").eq("week_start", round.week_start).not("artist_id", "is", null)
      const backCount: Record<string, number> = {}, backsByArtist: Record<string, { ts: number; seq: number }[]> = {}
      for (const c of backs || []) { backCount[c.artist_id] = (backCount[c.artist_id] || 0) + 1; (backsByArtist[c.artist_id] ||= []).push({ ts: new Date(c.created_at).getTime(), seq: c.seq }) }

      const ranked = Object.entries(streams).map(([a, s]) => ({ artist: a, streams: s })).sort((x, y) => y.streams - x.streams || x.artist.localeCompare(y.artist))
      race = ranked.slice(0, 15).map((r, i) => ({ rank: i + 1, artist: r.artist, streams: r.streams, backers: backCount[r.artist] || 0 }))

      if (ranked.length > 0) {
        const winner = ranked[0].artist
        // alpha from app_settings, and the settle reads the same key. It now
        // reads it the same WAY too. `av > 0` meant setting alpha to 0 in admin left
        // this preview weighting at full strength while the settle weighted at
        // zero, so the desk would have shown one split and paid another. Zero is
        // a real value: power(x, 0) is 1, every stake weighs its own size.
        let alpha = 1
        const { data: al } = await supabase.from("app_settings").select("value").eq("key", "cosign_weight_alpha").maybeSingle()
        const av = Number(al?.value); if (Number.isFinite(av) && av >= 0) alpha = av

        const winnerBacks = (backsByArtist[winner] || []).sort((a, b) => a.ts - b.ts || a.seq - b.seq)
        // Pool now builds from stakes: sum spins_staked across this round's backers.
        const { data: stakeRows } = await supabase
          .from("pit_cosigns").select("spins_staked")
          .eq("week_start", round.week_start).not("artist_id", "is", null)
        const pool = (stakeRows || []).reduce((a: number, r: any) => a + (Number(r.spins_staked) || 0), 0)
        const shares = previewSplit(winnerBacks, new Date(round.closes_at).getTime(), pool, alpha)
        const slots = winnerBacks.slice(0, 8).map((b, i) => ({ place: i + 1, ts: new Date(b.ts).toISOString(), spins: shares[i] || 0 }))
        preview = { winner_artist: winner, backers: winnerBacks.length, pool_spins: pool, alpha, slots }
      }
    }

    const { data: settled } = await supabase
      .from("pit_cosign_pools").select("week_start, sponsor_name, total_pool_value, reward_currency, settled_at, draw_summary, closes_at")
      .eq("status", "settled").order("closes_at", { ascending: false }).limit(12)

    return NextResponse.json({
      round: round ? {
        week_start: round.week_start, sponsor: round.sponsor_name, sponsor_url: round.sponsor_url,
        currency: round.reward_currency || "usdc", token_mint: round.token_mint,
        total_pool_value: Number(round.total_pool_value) || 0,
        opens_at: round.opens_at, closes_at: round.closes_at, status: round.status,
      } : null,
      race, preview,
      history: (settled || []).map((s: any) => ({
        week_start: s.week_start, sponsor: s.sponsor_name, total_pool_value: Number(s.total_pool_value) || 0,
        currency: s.reward_currency || "usdc", settled_at: s.settled_at, draw_summary: s.draw_summary,
      })),
    })
  } catch (e: any) {
    console.error("[admin/cosign]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
