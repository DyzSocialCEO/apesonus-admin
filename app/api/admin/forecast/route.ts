import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"

/**
 * GET /api/admin/forecast
 * Returns: forecast overview, recent days, pick stats, premium count
 */
export async function GET() {
  try {
    const supabase = await createAdminClient()
    const today = new Date().toISOString().split("T")[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]

    // Current day forecast
    const { data: todayForecast } = await supabase
      .from("forecast_days")
      .select("*")
      .eq("forecast_date", today)
      .maybeSingle()

    // Yesterday's forecast
    const { data: yesterdayForecast } = await supabase
      .from("forecast_days")
      .select("*")
      .eq("forecast_date", yesterday)
      .maybeSingle()

    // Today's picks count
    const { count: todayPicks } = await supabase
      .from("forecast_picks")
      .select("*", { count: "exact", head: true })
      .eq("forecast_date", today)

    // Yesterday's picks with results
    const { data: yesterdayPicks } = await supabase
      .from("forecast_picks")
      .select("mood_pick, artist_pick, mood_correct, artist_correct, total_moji_earned")
      .eq("forecast_date", yesterday)

    let yesterdayStats = null
    if (yesterdayPicks && yesterdayPicks.length > 0) {
      let moodCorrect = 0, artistCorrect = 0, bothCorrect = 0, totalMoji = 0
      for (const p of yesterdayPicks) {
        if (p.mood_correct) moodCorrect++
        if (p.artist_correct) artistCorrect++
        if (p.mood_correct && p.artist_correct) bothCorrect++
        totalMoji += p.total_moji_earned || 0
      }
      yesterdayStats = {
        totalPicks: yesterdayPicks.length,
        moodCorrect,
        artistCorrect,
        bothCorrect,
        moodAccuracy: Math.round((moodCorrect / yesterdayPicks.length) * 100),
        artistAccuracy: Math.round((artistCorrect / yesterdayPicks.length) * 100),
        totalMojiAwarded: totalMoji,
      }
    }

    // Last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0]
    const { data: recentDays } = await supabase
      .from("forecast_days")
      .select("forecast_date, status, winning_mood, winning_artist, total_picks")
      .gte("forecast_date", fourteenDaysAgo)
      .order("forecast_date", { ascending: false })

    // Premium subscriber count
    const { count: premiumCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("is_premium", true)
      .gt("premium_expires_at", new Date().toISOString())

    // Total MOJI in circulation
    const { data: mojiData } = await supabase
      .from("users")
      .select("total_moji")
    const totalMojiCirculation = mojiData?.reduce((sum, u) => sum + (u.total_moji || 0), 0) || 0

    // Unresolved days (status = 'open' and date < today)
    const { data: unresolvedDays } = await supabase
      .from("forecast_days")
      .select("forecast_date, total_picks")
      .eq("status", "open")
      .lt("forecast_date", today)
      .order("forecast_date", { ascending: false })

    return NextResponse.json({
      today: {
        date: today,
        forecast: todayForecast,
        picksCount: todayPicks || 0,
      },
      yesterday: {
        date: yesterday,
        forecast: yesterdayForecast,
        stats: yesterdayStats,
      },
      recentDays: recentDays || [],
      unresolvedDays: unresolvedDays || [],
      premiumSubscribers: premiumCount || 0,
      totalMojiCirculation,
    })
  } catch (error) {
    console.error("[Admin Forecast GET]", error)
    return NextResponse.json({ error: "Failed to load forecast data" }, { status: 500 })
  }
}

/**
 * POST /api/admin/forecast
 * Body: { action: "resolve", date?: "YYYY-MM-DD" }
 * Manually resolves a forecast day using play_history data.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, date } = body

    if (action !== "resolve") {
      return NextResponse.json({ error: "Unknown action. Supported: resolve" }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const resolveDate = date || new Date(Date.now() - 86400000).toISOString().split("T")[0]

    // Check forecast day exists
    const { data: forecastDay } = await supabase
      .from("forecast_days")
      .select("*")
      .eq("forecast_date", resolveDate)
      .maybeSingle()

    if (!forecastDay) {
      return NextResponse.json({ error: `No forecast day found for ${resolveDate}` }, { status: 404 })
    }

    if (forecastDay.status === "resolved") {
      return NextResponse.json({ error: `${resolveDate} already resolved`, forecast: forecastDay }, { status: 400 })
    }

    // Get completed plays for that day
    const startOfDay = `${resolveDate}T00:00:00Z`
    const endOfDay = `${resolveDate}T23:59:59Z`

    const { data: plays } = await supabase
      .from("play_history")
      .select("telegram_id, track_id")
      .gte("played_at", startOfDay)
      .lte("played_at", endOfDay)
      .eq("completed", true)

    // Get track metadata
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, mood, artist")
      .eq("is_active", true)

    const trackMap = new Map<number, { mood: string; artist: string }>()
    for (const t of tracks || []) {
      trackMap.set(t.id, { mood: t.mood, artist: t.artist })
    }

    // Count mood plays and artist unique listeners
    const moodCounts: Record<string, number> = {}
    const artistListeners: Record<string, Set<string>> = {}

    for (const play of plays || []) {
      const track = trackMap.get(play.track_id)
      if (!track) continue
      if (track.mood) moodCounts[track.mood] = (moodCounts[track.mood] || 0) + 1
      if (track.artist) {
        if (!artistListeners[track.artist]) artistListeners[track.artist] = new Set()
        artistListeners[track.artist].add(play.telegram_id)
      }
    }

    // Find winning mood
    let winningMood: string | null = null
    let maxMoodPlays = 0
    for (const [mood, count] of Object.entries(moodCounts)) {
      if (count > maxMoodPlays) { maxMoodPlays = count; winningMood = mood }
    }

    // Find winning artist
    let winningArtist: string | null = null
    let maxListeners = 0
    const listenerCounts: Record<string, number> = {}
    for (const [artist, listeners] of Object.entries(artistListeners)) {
      listenerCounts[artist] = listeners.size
      if (listeners.size > maxListeners) { maxListeners = listeners.size; winningArtist = artist }
    }

    // Update forecast_days
    await supabase
      .from("forecast_days")
      .update({
        status: "resolved",
        winning_mood: winningMood,
        winning_artist: winningArtist,
        listener_counts: listenerCounts,
        mood_play_counts: moodCounts,
        resolved_at: new Date().toISOString(),
      })
      .eq("forecast_date", resolveDate)

    // Score picks
    const { data: picks } = await supabase
      .from("forecast_picks")
      .select("id, telegram_id, mood_pick, artist_pick")
      .eq("forecast_date", resolveDate)

    const MOOD_CORRECT = 10, MOOD_INCORRECT = 2
    const ARTIST_CORRECT = 15, ARTIST_INCORRECT = 3
    const BOTH_BONUS = 5

    let scored = 0
    for (const pick of picks || []) {
      const moodRight = pick.mood_pick === winningMood
      const artistRight = pick.artist_pick === winningArtist
      const moodMoji = moodRight ? MOOD_CORRECT : MOOD_INCORRECT
      const artistMoji = artistRight ? ARTIST_CORRECT : ARTIST_INCORRECT
      const bothBonus = (moodRight && artistRight) ? BOTH_BONUS : 0
      const total = (pick.mood_pick ? moodMoji : 0) + (pick.artist_pick ? artistMoji : 0) + bothBonus

      await supabase
        .from("forecast_picks")
        .update({
          mood_correct: moodRight,
          artist_correct: artistRight,
          mood_moji_earned: pick.mood_pick ? moodMoji : 0,
          artist_moji_earned: pick.artist_pick ? artistMoji : 0,
          total_moji_earned: total,
        })
        .eq("id", pick.id)

      // Credit user
      if (total > 0) {
        await supabase.rpc("increment_moji", { p_telegram_id: pick.telegram_id, p_amount: total })
        await supabase.from("moji_transactions").insert({
          telegram_id: pick.telegram_id,
          amount: total,
          reason: `forecast_${resolveDate}`,
          details: { moodRight, artistRight, moodMoji, artistMoji: pick.artist_pick ? artistMoji : 0, bothBonus },
        })
      }
      scored++
    }

    return NextResponse.json({
      success: true,
      date: resolveDate,
      winningMood,
      winningArtist,
      totalPlays: plays?.length || 0,
      picksScored: scored,
      moodCounts,
      topListenerCounts: Object.fromEntries(
        Object.entries(listenerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      ),
    })
  } catch (error) {
    console.error("[Admin Forecast POST]", error)
    return NextResponse.json({ error: "Resolution failed" }, { status: 500 })
  }
}
