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
    const today = new Date().toISOString().split("T")[0]

    const { data: todayVotes } = await supabase
      .from("daily_mood_votes")
      .select("mood, telegram_id")
      .eq("vote_date", today)

    const todayBreakdown: Record<string, number> = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
    if (todayVotes) {
      for (const v of todayVotes) todayBreakdown[v.mood] = (todayBreakdown[v.mood] || 0) + 1
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
    const { data: weekVotes } = await supabase
      .from("daily_mood_votes")
      .select("mood, vote_date")
      .gte("vote_date", sevenDaysAgo)
      .order("vote_date", { ascending: true })

    const dailyData: Record<string, Record<string, number>> = {}
    if (weekVotes) {
      for (const v of weekVotes) {
        if (!dailyData[v.vote_date]) dailyData[v.vote_date] = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
        dailyData[v.vote_date][v.mood] = (dailyData[v.vote_date][v.mood] || 0) + 1
      }
    }

    const { count: totalVoters } = await supabase
      .from("daily_mood_votes")
      .select("telegram_id", { count: "exact", head: true })

    return NextResponse.json({
      today: {
        total: todayVotes?.length || 0,
        breakdown: todayBreakdown,
      },
      weekTrend: dailyData,
      totalVoters: totalVoters || 0,
    })
  } catch (error) {
    console.error("[Admin Pulse]", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
