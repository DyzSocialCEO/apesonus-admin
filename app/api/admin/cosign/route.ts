import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/cosign
 *
 * Co-Sign Desk snapshot (artist model): the current week's pool (cash + Spins +
 * sponsor + link), the live artist race (artists by total combined streams with
 * call counts), a read-only settlement preview (what the #1 artist's callers
 * would win if it settled now, decay-weighted), and settled-week history.
 */
const DECAY = 0.9
function normalize(name: string): string { return name === "Coinalisa Murado" ? "Coinalisa" : name }

function currentWeekStartUTC(): string {
  const now = new Date(); const day = now.getUTCDay(); const off = day === 0 ? 6 : day - 1
  const ws = new Date(now); ws.setUTCDate(now.getUTCDate() - off); ws.setUTCHours(0, 0, 0, 0)
  return ws.toISOString().split("T")[0]
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const week = currentWeekStartUTC()

    const { data: pool } = await supabase.from("pit_cosign_pools").select("*").eq("week_start", week).maybeSingle()

    // Streams per artist this week.
    const { data: listens } = await supabase.from("unique_listens").select("track_id").eq("week_start", week)
    const ids = Array.from(new Set((listens || []).map((l: any) => l.track_id)))
    const trackArtist: Record<number, string> = {}
    if (ids.length) {
      const { data: tracks } = await supabase.from("tracks").select("id, artist").in("id", ids)
      for (const t of tracks || []) trackArtist[t.id] = normalize(t.artist)
    }
    const streams: Record<string, number> = {}
    for (const l of listens || []) { const a = trackArtist[l.track_id]; if (a) streams[a] = (streams[a] || 0) + 1 }

    // Calls per artist + seqs.
    const { data: cosigns } = await supabase.from("pit_cosigns").select("artist_id, seq").eq("week_start", week).not("artist_id", "is", null)
    const csCount: Record<string, number> = {}, seqByArtist: Record<string, number[]> = {}
    for (const c of cosigns || []) { csCount[c.artist_id] = (csCount[c.artist_id] || 0) + 1; (seqByArtist[c.artist_id] ||= []).push(c.seq) }

    const ranked = Object.entries(streams).map(([a, s]) => ({ artist: a, streams: s })).sort((x, y) => y.streams - x.streams || x.artist.localeCompare(y.artist))
    const race = ranked.slice(0, 15).map((r, i) => ({ rank: i + 1, artist: r.artist, streams: r.streams, calls: csCount[r.artist] || 0 }))

    // Settlement preview: #1 artist's callers, decay-weighted cash.
    let preview: any = { winner: null, callers: 0, total_paid: 0 }
    const cashPool = Number(pool?.total_pool_value) || 0
    if (ranked.length > 0) {
      const winner = ranked[0].artist
      const seqs = (seqByArtist[winner] || []).sort((a, b) => a - b)
      const totalW = seqs.reduce((a, s) => a + Math.pow(DECAY, s - 1), 0)
      const top = seqs.slice(0, 5).map((s) => ({ seq: s, pct: totalW > 0 ? (Math.pow(DECAY, s - 1) / totalW) * 100 : 0 }))
      preview = { winner_artist: winner, callers: seqs.length, currency: pool?.reward_currency || "usdc", total_paid: cashPool, top }
    }

    // History.
    const { data: settled } = await supabase
      .from("pit_cosign_pools").select("week_start, sponsor_name, total_pool_value, reward_currency, settled_at")
      .eq("status", "settled").order("week_start", { ascending: false }).limit(12)

    return NextResponse.json({
      week_start: week,
      pool: pool ? {
        sponsor: pool.sponsor_name, sponsor_url: pool.sponsor_url,
        currency: pool.reward_currency || "usdc", token_mint: pool.token_mint,
        total_pool_value: cashPool, spins_pot: Number(pool.pool_spins) || 0, status: pool.status,
      } : null,
      race, preview,
      history: (settled || []).map((s: any) => ({
        week_start: s.week_start, sponsor: s.sponsor_name,
        total_pool_value: Number(s.total_pool_value) || 0, currency: s.reward_currency || "usdc", settled_at: s.settled_at,
      })),
    })
  } catch (e: any) {
    console.error("[admin/cosign]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
