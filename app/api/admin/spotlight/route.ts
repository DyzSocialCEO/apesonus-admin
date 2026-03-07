import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { ARTIST_ROSTER } from "@/lib/constants/artists"
import { awardOnus } from "@/lib/award-onus"

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://app.apesonus.com"

/**
 * GET /api/admin/spotlight
 * Returns all user spotlight picks with stats.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get("filter") || "all" // all | active | settled

    let query = supabase
      .from("user_spotlights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (filter === "active") query = query.eq("settled", false)
    if (filter === "settled") query = query.eq("settled", true)

    const { data: spotlights } = await query

    // Get user info for display
    const telegramIds = [...new Set((spotlights || []).map(s => s.telegram_id))]
    let userMap: Record<string, { username: string; first_name: string }> = {}
    if (telegramIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("telegram_id, username, first_name")
        .in("telegram_id", telegramIds)

      for (const u of users || []) {
        userMap[u.telegram_id] = { username: u.username, first_name: u.first_name }
      }
    }

    // Enrich with artist names and user info
    const enriched = (spotlights || []).map(s => ({
      ...s,
      artistName: ARTIST_ROSTER[s.artist_id]?.name || s.artist_id,
      userName: userMap[s.telegram_id]?.first_name || userMap[s.telegram_id]?.username || s.telegram_id,
    }))

    // Summary stats
    const active = (spotlights || []).filter(s => !s.settled)
    const settled = (spotlights || []).filter(s => s.settled)
    const totalOnusAwarded = settled.reduce((sum, s) => sum + (s.onus_earned || 0), 0)

    // Artist popularity
    const artistCounts: Record<string, number> = {}
    for (const s of active) {
      artistCounts[s.artist_id] = (artistCounts[s.artist_id] || 0) + 1
    }

    return NextResponse.json({
      spotlights: enriched,
      summary: {
        totalActive: active.length,
        totalSettled: settled.length,
        totalOnusAwarded,
        artistBreakdown: Object.entries(artistCounts)
          .map(([id, count]) => ({ artistId: id, name: ARTIST_ROSTER[id]?.name || id, count }))
          .sort((a, b) => b.count - a.count),
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

/**
 * POST /api/admin/spotlight
 * Actions: settle (settle all expired), updateCap, forceSettle (settle specific)
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    if (action === "settle") {
      // Call the main app's settle endpoint
      const cronSecret = process.env.CRON_SECRET
      const res = await fetch(`${MAIN_APP_URL}/api/backing/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({}),
      })
      const result = await res.json()
      return NextResponse.json(result)
    }

    if (action === "updateCap") {
      const { spotlightId, newCap } = body
      if (!spotlightId || !newCap) {
        return NextResponse.json({ error: "spotlightId and newCap required" }, { status: 400 })
      }
      const { error } = await supabase
        .from("user_spotlights")
        .update({ onus_cap: newCap })
        .eq("id", spotlightId)

      if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 })
      return NextResponse.json({ success: true, newCap })
    }

    if (action === "forceSettle") {
      const { spotlightId } = body
      if (!spotlightId) return NextResponse.json({ error: "spotlightId required" }, { status: 400 })

      const { data: spotlight } = await supabase
        .from("user_spotlights")
        .select("*")
        .eq("id", spotlightId)
        .single()

      if (!spotlight) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (spotlight.settled) return NextResponse.json({ error: "Already settled" }, { status: 409 })

      // Count unique listens for this artist during this period
      const { data: allTracks } = await supabase
        .from("tracks")
        .select("id, artist")
        .eq("is_active", true)

      const artistTrackIds = (allTracks || [])
        .filter(t => {
          const primary = t.artist.split(/\s+ft\.?\s+|\s+feat\.?\s+/i)[0].trim().toLowerCase().replace(/\s+/g, "-")
          return primary === spotlight.artist_id
        })
        .map(t => t.id)

      let uniqueListens = 0
      if (artistTrackIds.length > 0) {
        const { count } = await supabase
          .from("unique_listens")
          .select("*", { count: "exact", head: true })
          .in("track_id", artistTrackIds)
          .gte("week_start", spotlight.period_start)
          .lte("week_start", spotlight.period_end)

        uniqueListens = count || 0
      }

      const earned = Math.min(uniqueListens, spotlight.onus_cap || 50000)

      if (earned > 0) {
        await awardOnus(supabase, spotlight.telegram_id, earned, "spotlight_reward", `spotlight_${spotlight.id}`)
      }

      await supabase
        .from("user_spotlights")
        .update({ settled: true, onus_earned: earned, settled_at: new Date().toISOString() })
        .eq("id", spotlight.id)

      return NextResponse.json({ settled: true, earned, uniqueListens })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
