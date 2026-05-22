import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true })

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { count: activeUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("last_played_at", sevenDaysAgo)

    const { count: newUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo)

    const { data: playData } = await supabase.from("users").select("tracks_played")
    const totalPlays = playData?.reduce((sum, u) => sum + (u.tracks_played || 0), 0) || 0

    const { count: totalTracks } = await supabase.from("tracks").select("*", { count: "exact", head: true }).eq("is_active", true)

    const today = new Date().toISOString().split("T")[0]
    const { count: todayVotes } = await supabase.from("market_sentiment_votes").select("*", { count: "exact", head: true }).eq("vote_date", today)

    const { count: activeStreaks } = await supabase.from("user_streaks").select("*", { count: "exact", head: true }).eq("is_active", true)

    // Mood breakdown from mood_stats
    const { data: moodData } = await supabase.from("mood_stats").select("mood, play_count")
    const moodBreakdown: Record<string, number> = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
    moodData?.forEach((m) => { moodBreakdown[m.mood] = (moodBreakdown[m.mood] || 0) + m.play_count })

    // Top tracks
    const { data: topTracks } = await supabase.from("tracks").select("id, title, artist, play_count").order("play_count", { ascending: false }).limit(5)

    // Referral count from referred_by field
    const { count: totalReferrals } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .not("referred_by", "is", null)

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      newUsers: newUsers || 0,
      totalPlays,
      totalTracks: totalTracks || 0,
      todayVotes: todayVotes || 0,
      activeStreaks: activeStreaks || 0,
      totalReferrals: totalReferrals || 0,
      moodBreakdown,
      topTracks: topTracks || [],
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
