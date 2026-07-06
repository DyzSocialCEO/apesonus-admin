import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/cosign
 *
 * Backing Desk snapshot: the current round (sponsor, cash pool, open/close
 * times, status), the live artist race (artists by total streams in the round
 * window with backing counts), and a settlement preview — if the round closed
 * now, which artist wins and how the top-5 draw pool looks. Plus settled-round
 * history.
 */
const DECAY = 0.9
function normalize(name: string): string { return name === "Coinalisa Murado" ? "Coinalisa" : name }

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
      // Streams per artist within the round window.
      const { data: plays } = await supabase
        .from("play_history").select("track_id")
        .gte("played_at", round.opens_at).lt("played_at", round.closes_at).limit(20000)
      const ids = Array.from(new Set((plays || []).map((p: any) => p.track_id)))
      const trackArtist: Record<number, string> = {}
      if (ids.length) {
        const { data: tracks } = await supabase.from("tracks").select("id, artist").in("id", ids)
        for (const t of tracks || []) trackArtist[t.id] = normalize(t.artist)
      }
      const streams: Record<string, number> = {}
      for (const p of plays || []) { const a = trackArtist[p.track_id]; if (a) streams[a] = (streams[a] || 0) + 1 }

      const { data: backs } = await supabase.from("pit_cosigns").select("artist_id, seq").eq("week_start", round.week_start).not("artist_id", "is", null)
      const backCount: Record<string, number> = {}, seqByArtist: Record<string, number[]> = {}
      for (const c of backs || []) { backCount[c.artist_id] = (backCount[c.artist_id] || 0) + 1; (seqByArtist[c.artist_id] ||= []).push(c.seq) }

      const ranked = Object.entries(streams).map(([a, s]) => ({ artist: a, streams: s })).sort((x, y) => y.streams - x.streams || x.artist.localeCompare(y.artist))
      race = ranked.slice(0, 15).map((r, i) => ({ rank: i + 1, artist: r.artist, streams: r.streams, backers: backCount[r.artist] || 0 }))

      if (ranked.length > 0) {
        const winner = ranked[0].artist
        const seqs = (seqByArtist[winner] || []).sort((a, b) => a - b)
        const totalW = seqs.reduce((a, s) => a + Math.pow(DECAY, s - 1), 0)
        const tiers = [45, 25, 15, 10, 5]
        const pool = Number(round.total_pool_value) || 0
        // preview shows the tier prizes (who fills them is random at draw)
        const slots = tiers.map((pct, i) => ({ place: i + 1, pct, cash: (pct / 100) * pool, filled: seqs.length > i }))
        preview = { winner_artist: winner, backers: seqs.length, currency: round.reward_currency || "usdc", pool, slots }
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
