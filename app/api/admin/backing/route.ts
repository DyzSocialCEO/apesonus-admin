import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { ARTIST_ROSTER } from "@/lib/constants/artists"

/**
 * GET /api/admin/backing?week=YYYY-MM-DD
 * Returns artist backing stats for a given week (defaults to current week).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get("week")
    const weekStart = weekParam || getWeekStart()

    const supabase = await createAdminClient()

    // Get artist weekly stats for this week
    const { data: weeklyStats } = await supabase
      .from("artist_weekly_stats")
      .select("*")
      .eq("week_start", weekStart)
      .order("total_backers", { ascending: false })

    // Get recent backing activity (last 50 regardless of week filter)
    const { data: recentBackings } = await supabase
      .from("artist_backing")
      .select("telegram_id, artist_id, tier, onus_spent, is_genesis, created_at, week_start")
      .order("created_at", { ascending: false })
      .limit(50)

    // Enrich with artist names
    const artistStats = (weeklyStats || []).map((row) => {
      const profile = ARTIST_ROSTER[row.artist_id as keyof typeof ARTIST_ROSTER]
      return {
        artistId: row.artist_id,
        artistName: profile?.name || row.artist_id,
        weekStart: row.week_start,
        totalBackers: row.total_backers || 0,
        totalOnusBacked: row.total_onus_backed || 0,
        momentum: row.momentum || "steady",
        isGenesisWeek: row.is_genesis_week || false,
      }
    })

    const enrichedBackings = (recentBackings || []).map((b) => {
      const profile = ARTIST_ROSTER[b.artist_id as keyof typeof ARTIST_ROSTER]
      return {
        telegramId: b.telegram_id,
        artistId: b.artist_id,
        artistName: profile?.name || b.artist_id,
        tier: b.tier,
        onusSpent: b.onus_spent,
        isGenesis: b.is_genesis,
        createdAt: b.created_at,
        weekStart: b.week_start,
      }
    })

    // Build summary
    const totalBackers = artistStats.reduce((s, a) => s + a.totalBackers, 0)
    const totalOnusBacked = artistStats.reduce((s, a) => s + a.totalOnusBacked, 0)
    const topArtist = artistStats[0] || null
    const genesisArtists = artistStats.filter((a) => a.isGenesisWeek).length

    return NextResponse.json({
      summary: {
        totalBackers,
        totalOnusBacked,
        topArtist: topArtist?.artistName || null,
        topArtistBackers: topArtist?.totalBackers || 0,
        genesisArtists,
        weekStart,
      },
      artistStats,
      recentBackings: enrichedBackings,
    })
  } catch (error) {
    console.error("[Admin/backing] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day
  const weekStart = new Date(now)
  weekStart.setUTCDate(diff)
  weekStart.setUTCHours(0, 0, 0, 0)
  return weekStart.toISOString().split("T")[0]
}
