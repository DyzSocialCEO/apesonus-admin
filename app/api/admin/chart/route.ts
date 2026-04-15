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

    // Current week
    const now = new Date()
    const dayOfWeek = now.getUTCDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - mondayOffset)
    weekStart.setUTCHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split("T")[0]

    const nextWeekStart = new Date(weekStart)
    nextWeekStart.setDate(weekStart.getDate() + 7)
    const nextWeekStartStr = nextWeekStart.toISOString().split("T")[0]

    // Chart data
    const { data: listens } = await supabase
      .from("unique_listens").select("track_id").eq("week_start", weekStartStr)

    const countMap: Record<number, number> = {}
    if (listens) {
      for (const l of listens) countMap[l.track_id] = (countMap[l.track_id] || 0) + 1
    }

    const ranked = Object.entries(countMap)
      .map(([trackId, count]) => ({ trackId: parseInt(trackId), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    const trackIds = ranked.map(r => r.trackId)
    const { data: tracks } = await supabase
      .from("tracks").select("id, title, artist, mood").in("id", trackIds.length > 0 ? trackIds : [0])

    const trackMap: Record<number, any> = {}
    if (tracks) for (const t of tracks) trackMap[t.id] = t

    const chart = ranked.filter(r => trackMap[r.trackId]).map((r, i) => ({
      rank: i + 1, track: trackMap[r.trackId], listeners: r.count,
    }))

    // Forecast stats
    const { data: v2Forecasts } = await supabase
      .from("chart_forecasts_v2").select("id").eq("week_start", nextWeekStartStr)

    // Recent resolutions
    const { data: results } = await supabase
      .from("forecast_weekly_results").select("*").order("resolved_at", { ascending: false }).limit(5)

    // Check forecast lock (stored in app_settings)
    const { data: lockSetting } = await supabase
      .from("app_settings").select("value").eq("key", "forecast_locked").maybeSingle()

    return NextResponse.json({
      weekStart: weekStartStr,
      nextWeekStart: nextWeekStartStr,
      chart,
      forecastCount: v2Forecasts?.length || 0,
      recentResults: results || [],
      forecastLocked: lockSetting?.value === "true",
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    if (action === "lock" || action === "unlock") {
      await supabase.from("app_settings").upsert(
        { key: "forecast_locked", value: action === "lock" ? "true" : "false" },
        { onConflict: "key" }
      )
      return NextResponse.json({ success: true, locked: action === "lock" })
    }

    if (action === "reset") {
      // Wipe all forecast v2 data for a fresh start
      await supabase.from("chart_forecasts_v2").delete().neq("id", 0)
      await supabase.from("forecast_weekly_results").delete().neq("id", 0)
      return NextResponse.json({ success: true, message: "Forecast data reset" })
    }

    if (action === "resolve") {
      // Call the main app's resolve endpoint
      const mainAppUrl = process.env.MAIN_APP_URL || "https://apesonus.com"
      const secret = process.env.CRON_SECRET || process.env.ADMIN_SECRET_KEY || ""
      const res = await fetch(`${mainAppUrl}/api/chart/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
