import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Total users
    const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true })

    // Active users (7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { count: activeUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("last_played_at", sevenDaysAgo)

    // New users (7 days)
    const { count: newUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo)

    // Total plays
    const { data: playData } = await supabase.from("users").select("tracks_played")
    const totalPlays = playData?.reduce((sum, u) => sum + (u.tracks_played || 0), 0) || 0

    // Active subs
    const { count: activeSubs } = await supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active")

    // Total tracks
    const { count: totalTracks } = await supabase.from("tracks").select("*", { count: "exact", head: true }).eq("is_active", true)

    // Revenue
    const { data: revData } = await supabase.from("subscriptions").select("amount_paid")
    const totalRevenue = revData?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0

    // Mood breakdown
    const { data: moodData } = await supabase.from("mood_stats").select("mood, play_count")
    const moodBreakdown: Record<string, number> = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
    moodData?.forEach((m) => { moodBreakdown[m.mood] = (moodBreakdown[m.mood] || 0) + m.play_count })

    // Top tracks
    const { data: topTracks } = await supabase.from("tracks").select("id, title, artist, play_count").order("play_count", { ascending: false }).limit(5)

    // Referral stats
    const { data: refData } = await supabase.from("users").select("referral_count").gt("referral_count", 0)
    const totalReferrals = refData?.reduce((sum, u) => sum + (u.referral_count || 0), 0) || 0

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      newUsers: newUsers || 0,
      totalPlays,
      activeSubs: activeSubs || 0,
      totalTracks: totalTracks || 0,
      totalRevenue,
      totalReferrals,
      moodBreakdown,
      topTracks: topTracks || [],
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
