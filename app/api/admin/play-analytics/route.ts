import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Detailed listening analytics over a time window: who is played, what is
// played, the play trend, and who is doing the listening. All derived from
// play_history (track_id + played_at + user_id) joined to tracks and users —
// real data, no dead concepts. Aggregated in JS, which is cheap at this scale.

const MAX_ROWS = 20000
const DAY = 86400000

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const url = new URL(req.url)
    const win = url.searchParams.get("window") || "30"
    const days = win === "7" ? 7 : win === "all" ? null : 30
    const since = days ? new Date(Date.now() - days * DAY) : null

    // ── Pull plays in the window ──
    let q = supabase
      .from("play_history")
      .select("user_id, track_id, played_at")
      .order("played_at", { ascending: false })
      .limit(MAX_ROWS)
    if (since) q = q.gte("played_at", since.toISOString())
    const { data: plays } = await q
    const rows = (plays || []).filter((r) => r.played_at)

    // ── Resolve the tracks and users these plays reference ──
    const trackIds = Array.from(new Set(rows.map((r) => r.track_id).filter(Boolean)))
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))

    const trackInfo: Record<string, { title: string; artist: string }> = {}
    if (trackIds.length) {
      const { data: trs } = await supabase.from("tracks").select("id, title, artist").in("id", trackIds)
      for (const t of trs || []) trackInfo[String(t.id)] = { title: t.title || "Untitled", artist: t.artist || "Unknown" }
    }
    const userName: Record<string, string> = {}
    if (userIds.length) {
      const { data: us } = await supabase.from("users").select("id, display_name, email").in("id", userIds)
      for (const u of us || []) userName[u.id] = (u.display_name || u.email || String(u.id).slice(0, 8)) as string
    }

    // ── Aggregations ──
    const byTrack: Record<string, number> = {}
    const byArtist: Record<string, number> = {}
    const byUser: Record<string, number> = {}
    const byDay: Record<string, number> = {}
    let earliest = Date.now()

    for (const r of rows) {
      const t = trackInfo[String(r.track_id)]
      if (r.track_id) byTrack[String(r.track_id)] = (byTrack[String(r.track_id)] || 0) + 1
      if (t) byArtist[t.artist] = (byArtist[t.artist] || 0) + 1
      if (r.user_id) byUser[r.user_id] = (byUser[r.user_id] || 0) + 1
      const ts = new Date(r.played_at as string).getTime()
      if (ts < earliest) earliest = ts
      byDay[dayKey(new Date(ts))] = (byDay[dayKey(new Date(ts))] || 0) + 1
    }

    const tracksTop = Object.entries(byTrack)
      .map(([id, plays]) => ({ id, title: trackInfo[id]?.title || "Untitled", artist: trackInfo[id]?.artist || "Unknown", plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10)

    const artistsTop = Object.entries(byArtist)
      .map(([artist, plays]) => ({ artist, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10)

    const listenersTop = Object.entries(byUser)
      .map(([id, plays]) => ({ id, name: userName[id] || String(id).slice(0, 8), plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10)

    // ── Trend: daily buckets across the window (or full span for "all") ──
    const start = since ? since.getTime() : earliest
    const spanDays = Math.max(1, Math.ceil((Date.now() - start) / DAY))
    const weekly = spanDays > 92
    const trend: { label: string; plays: number }[] = []
    if (weekly) {
      const weeks = Math.ceil(spanDays / 7)
      for (let i = weeks - 1; i >= 0; i--) {
        const wStart = new Date(Date.now() - (i * 7 + 6) * DAY)
        let sum = 0
        for (let d = 0; d < 7; d++) sum += byDay[dayKey(new Date(wStart.getTime() + d * DAY))] || 0
        trend.push({ label: dayKey(wStart).slice(5), plays: sum })
      }
    } else {
      for (let i = spanDays - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY)
        trend.push({ label: dayKey(d).slice(5), plays: byDay[dayKey(d)] || 0 })
      }
    }

    return NextResponse.json({
      window: win,
      totalPlays: rows.length,
      uniqueListeners: userIds.length,
      uniqueTracks: trackIds.length,
      artistsTop,
      tracksTop,
      listenersTop,
      trend,
      bucket: weekly ? "week" : "day",
    })
  } catch (error) {
    console.error("[admin/play-analytics]", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
