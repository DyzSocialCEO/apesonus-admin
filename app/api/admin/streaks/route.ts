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

    const { count: activeStreaks } = await supabase
      .from("user_streaks")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)

    const { count: verifiedUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("is_verified", true)

    const { data: topStreakers } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, completed_streaks, last_checkin_date, streak_start_date")
      .eq("is_active", true)
      .order("completed_streaks", { ascending: false })
      .limit(20)

    const tids = topStreakers?.map((s) => s.telegram_id) || []
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, is_verified")
      .in("telegram_id", tids)

    const userMap = new Map(users?.map((u) => [u.telegram_id, u]) || [])

    const enrichedStreakers = (topStreakers || []).map((s) => ({
      ...s,
      user: userMap.get(s.telegram_id) || null,
    }))

    const { data: allStreaks } = await supabase
      .from("user_streaks")
      .select("current_day, completed_streaks")
      .eq("is_active", true)

    const dayDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
    if (allStreaks) {
      for (const s of allStreaks) {
        const day = s.current_day || 1
        dayDistribution[day] = (dayDistribution[day] || 0) + 1
      }
    }

    return NextResponse.json({
      activeStreaks: activeStreaks || 0,
      verifiedUsers: verifiedUsers || 0,
      topStreakers: enrichedStreakers,
      dayDistribution,
    })
  } catch (error) {
    console.error("[Admin Streaks]", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
