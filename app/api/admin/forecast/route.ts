export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Get last 10 rounds
    const { data: rounds } = await supabase
      .from("forecast_rounds")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(10)

    // Get entry counts per round
    const roundIds = rounds?.map(r => r.id) || []
    const { data: entries } = await supabase
      .from("forecast_entries")
      .select("round_id, telegram_id, pick_1, pick_2, pick_3, score, onus_earned")
      .in("round_id", roundIds.length > 0 ? roundIds : [0])

    const entryMap = new Map<number, typeof entries>()
    for (const e of entries || []) {
      if (!entryMap.has(e.round_id)) entryMap.set(e.round_id, [])
      entryMap.get(e.round_id)!.push(e)
    }

    const enriched = (rounds || []).map(r => ({
      ...r,
      entries: entryMap.get(r.id) || [],
      entryCount: entryMap.get(r.id)?.length || 0,
    }))

    return NextResponse.json({ rounds: enriched })
  } catch (error) {
    console.error("[Admin Forecast] Error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { action, weekStart } = await request.json()
    const supabase = await createAdminClient()

    if (action === "open") {
      // Calculate this week's Monday if not provided
      let ws = weekStart
      if (!ws) {
        const now = new Date()
        const dayOfWeek = now.getUTCDay()
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const wk = new Date(now)
        wk.setUTCDate(now.getUTCDate() - mondayOffset)
        wk.setUTCHours(0, 0, 0, 0)
        ws = wk.toISOString().split("T")[0]
      }

      // Check if round exists
      const { data: existing } = await supabase
        .from("forecast_rounds")
        .select("id, status")
        .eq("week_start", ws)
        .maybeSingle()

      if (existing) {
        // Re-open if locked/paused
        await supabase
          .from("forecast_rounds")
          .update({ status: "open" })
          .eq("id", existing.id)
        return NextResponse.json({ success: true, action: "reopened", roundId: existing.id, weekStart: ws })
      }

      const { data: newRound, error } = await supabase
        .from("forecast_rounds")
        .insert({ week_start: ws, status: "open" })
        .select("id")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: "opened", roundId: newRound.id, weekStart: ws })
    }

    if (action === "lock") {
      if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 })
      const { error } = await supabase
        .from("forecast_rounds")
        .update({ status: "locked", locked_at: new Date().toISOString() })
        .eq("week_start", weekStart)
        .eq("status", "open")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: "locked", weekStart })
    }

    if (action === "settle") {
      if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 })

      // Call the settle endpoint on the main app
      // Since admin is separate, we do the settling logic here directly
      const { data: round } = await supabase
        .from("forecast_rounds")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle()

      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 })
      if (round.status === "settled") return NextResponse.json({ message: "Already settled" })

      // Get tracks for artist mapping
      const { data: allTracks } = await supabase
        .from("tracks")
        .select("id, artist")
        .eq("is_active", true)

      const trackToArtist = new Map<number, string>()
      const artistIdMap = new Map<string, string>()
      for (const t of allTracks || []) {
        trackToArtist.set(t.id, t.artist)
        const primary = t.artist.split(/\s+ft\.?\s+|\s+feat\.?\s+/i)[0].trim()
        artistIdMap.set(primary.toLowerCase().replace(/\s+/g, "-"), t.artist)
      }

      // Get unique listens
      const { data: listens } = await supabase
        .from("unique_listens")
        .select("telegram_id, track_id")
        .eq("week_start", weekStart)

      const listenersByArtist = new Map<string, Set<string>>()
      for (const l of listens || []) {
        const artist = trackToArtist.get(l.track_id)
        if (!artist) continue
        const id = artist.split(/\s+ft\.?\s+|\s+feat\.?\s+/i)[0].trim().toLowerCase().replace(/\s+/g, "-")
        if (!listenersByArtist.has(id)) listenersByArtist.set(id, new Set())
        listenersByArtist.get(id)!.add(String(l.telegram_id))
      }

      const rankings = Array.from(listenersByArtist.entries())
        .map(([id, listeners]) => ({ id, name: artistIdMap.get(id) || id, count: listeners.size }))
        .sort((a, b) => b.count - a.count)

      const top5 = new Set(rankings.slice(0, 5).map(r => r.id))
      const winnerId = rankings[0]?.id || null

      const countsJson: Record<string, number> = {}
      for (const r of rankings) countsJson[r.id] = r.count

      // Score entries
      const { data: entries } = await supabase
        .from("forecast_entries")
        .select("*")
        .eq("round_id", round.id)

      const REWARDS: Record<number, number> = { 3: 300, 2: 150, 1: 50, 0: 10 }

      for (const entry of entries || []) {
        const picks = [entry.pick_1, entry.pick_2, entry.pick_3]
        const score = picks.filter(p => top5.has(p)).length
        const onus = REWARDS[score] || 10

        await supabase
          .from("forecast_entries")
          .update({ score, onus_earned: onus })
          .eq("id", entry.id)

        // Award $ONUS
        const { data: user } = await supabase
          .from("users")
          .select("total_onus")
          .eq("telegram_id", entry.telegram_id)
          .maybeSingle()

        if (user) {
          await supabase
            .from("users")
            .update({ total_onus: (user.total_onus || 0) + onus })
            .eq("telegram_id", entry.telegram_id)
        }
      }

      // Mark settled
      await supabase
        .from("forecast_rounds")
        .update({
          status: "settled",
          settled_at: new Date().toISOString(),
          winner_artist: winnerId,
          listener_counts: countsJson,
        })
        .eq("id", round.id)

      return NextResponse.json({
        success: true,
        action: "settled",
        winner: winnerId,
        rankings: rankings.slice(0, 5),
        entries: entries?.length || 0,
      })
    }

    if (action === "pause") {
      if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 })
      await supabase
        .from("forecast_rounds")
        .update({ status: "paused" })
        .eq("week_start", weekStart)
      return NextResponse.json({ success: true, action: "paused", weekStart })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[Admin Forecast] POST Error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
