import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/cosign
 *
 * The Co-Sign Desk snapshot: the current week's pool, the live race (tracks by
 * unique listeners with co-sign counts), a read-only settlement preview (what
 * would pay out if the week settled right now, tiered 3/2/1), and the history
 * of settled weeks. Week is Monday-based UTC, matching the app + Chart.
 */
function currentWeekStartUTC(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const off = day === 0 ? 6 : day - 1
  const ws = new Date(now)
  ws.setUTCDate(now.getUTCDate() - off)
  ws.setUTCHours(0, 0, 0, 0)
  return ws.toISOString().split("T")[0]
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const week = currentWeekStartUTC()

    const { data: pool } = await supabase
      .from("pit_cosign_pools").select("*").eq("week_start", week).maybeSingle()

    // Unique listeners per track this week.
    const { data: listens } = await supabase
      .from("unique_listens").select("track_id").eq("week_start", week)
    const ears: Record<number, number> = {}
    for (const l of listens || []) ears[l.track_id] = (ears[l.track_id] || 0) + 1

    // Co-sign counts + first-100 seq lists per track this week.
    const { data: cosigns } = await supabase
      .from("pit_cosigns").select("track_id, seq").eq("week_start", week)
    const csCount: Record<number, number> = {}
    const seqByTrack: Record<number, number[]> = {}
    for (const c of cosigns || []) {
      csCount[c.track_id] = (csCount[c.track_id] || 0) + 1
      ;(seqByTrack[c.track_id] ||= []).push(c.seq)
    }

    const ranked = Object.entries(ears)
      .map(([tid, e]) => ({ trackId: Number(tid), ears: e }))
      .sort((a, b) => b.ears - a.ears || a.trackId - b.trackId)

    // Track titles for the race + preview.
    const ids = ranked.slice(0, 15).map((r) => r.trackId)
    const tmap: Record<number, { title: string; artist: string }> = {}
    if (ids.length) {
      const { data: tracks } = await supabase.from("tracks").select("id, title, artist").in("id", ids)
      for (const t of tracks || []) tmap[t.id] = { title: t.title, artist: t.artist }
    }

    const race = ranked.slice(0, 15).map((r, i) => ({
      rank: i + 1,
      track_id: r.trackId,
      title: tmap[r.trackId]?.title || `#${r.trackId}`,
      artist: tmap[r.trackId]?.artist || "",
      ears: r.ears,
      cosigns: csCount[r.trackId] || 0,
    }))

    // Settlement preview for the current week (read-only mirror of the function).
    let preview: any = { winner: null, signers: 0, total_shares: 0, per_share: 0, total_paid: 0 }
    const poolSpins = Number(pool?.pool_spins) || 0
    if (ranked.length > 0) {
      const winner = ranked[0].trackId
      const seqs = (seqByTrack[winner] || []).filter((s) => s <= 100)
      const totalShares = seqs.reduce((a, s) => a + (s <= 10 ? 3 : s <= 50 ? 2 : 1), 0)
      const perShare = totalShares > 0 ? Math.floor(poolSpins / totalShares) : 0
      preview = {
        winner_track_id: winner,
        winner_title: tmap[winner]?.title || `#${winner}`,
        signers: seqs.length,
        total_shares: totalShares,
        per_share: perShare,
        total_paid: perShare * totalShares,
      }
    }

    // History: settled weeks with winner + totals from the receipts.
    const { data: settled } = await supabase
      .from("pit_cosign_pools").select("week_start, sponsor_name, pool_spins, settled_at")
      .eq("status", "settled").order("week_start", { ascending: false }).limit(12)
    const { data: rewardRows } = await supabase
      .from("pit_cosign_rewards").select("week_start, track_id, spins")
    const byWeek: Record<string, { paid: number; signers: number; track_id: number | null }> = {}
    for (const r of rewardRows || []) {
      const w = byWeek[r.week_start] ||= { paid: 0, signers: 0, track_id: null }
      w.paid += Number(r.spins) || 0
      w.signers += 1
      w.track_id = r.track_id
    }
    const histIds = Array.from(new Set(Object.values(byWeek).map((w) => w.track_id).filter(Boolean))) as number[]
    const htmap: Record<number, string> = {}
    if (histIds.length) {
      const { data: t } = await supabase.from("tracks").select("id, title").in("id", histIds)
      for (const x of t || []) htmap[x.id] = x.title
    }
    const history = (settled || []).map((s) => ({
      week_start: s.week_start,
      sponsor: s.sponsor_name,
      pool_spins: Number(s.pool_spins) || 0,
      settled_at: s.settled_at,
      winner_title: byWeek[s.week_start]?.track_id ? htmap[byWeek[s.week_start].track_id as number] : null,
      signers: byWeek[s.week_start]?.signers || 0,
      paid: byWeek[s.week_start]?.paid || 0,
    }))

    return NextResponse.json({
      week_start: week,
      pool: pool ? { sponsor: pool.sponsor_name, pool_spins: poolSpins, status: pool.status } : null,
      race,
      preview,
      history,
    })
  } catch (e: any) {
    console.error("[admin/cosign]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
