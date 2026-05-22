import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/pulse
 *
 * Vibe Check Tier 1 admin dashboard data. Reads from the live
 * market_sentiment_votes table (the one the PWA writes to). Three
 * sentiment buckets: bullish, bearish, neutral.
 *
 * Previously read from the killed daily_mood_votes table with the
 * five-mood buckets (moon/rekt/cope/degen/zen). That system was
 * replaced pre-launch and the old table is no longer written to.
 *
 * Response shape:
 *   {
 *     today: { total, breakdown: { bullish, bearish, neutral } },
 *     weekTrend: { "YYYY-MM-DD": { bullish, bearish, neutral } },
 *     totalVoters: number  // total all-time vote rows
 *   }
 */

type Sentiment = "bullish" | "bearish" | "neutral"
const SENTIMENTS: Sentiment[] = ["bullish", "bearish", "neutral"]

function emptyBreakdown(): Record<Sentiment, number> {
  return { bullish: 0, bearish: 0, neutral: 0 }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const today = new Date().toISOString().split("T")[0]

    // Today's votes
    const { data: todayVotes } = await supabase
      .from("market_sentiment_votes")
      .select("sentiment, user_id")
      .eq("vote_date", today)

    const todayBreakdown = emptyBreakdown()
    if (todayVotes) {
      for (const v of todayVotes) {
        const s = v.sentiment as Sentiment
        if (SENTIMENTS.includes(s)) {
          todayBreakdown[s] = todayBreakdown[s] + 1
        }
      }
    }

    // 7-day rolling trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
    const { data: weekVotes } = await supabase
      .from("market_sentiment_votes")
      .select("sentiment, vote_date")
      .gte("vote_date", sevenDaysAgo)
      .order("vote_date", { ascending: true })

    const dailyData: Record<string, Record<Sentiment, number>> = {}
    if (weekVotes) {
      for (const v of weekVotes) {
        const date = v.vote_date as string
        const s = v.sentiment as Sentiment
        if (!dailyData[date]) dailyData[date] = emptyBreakdown()
        if (SENTIMENTS.includes(s)) {
          dailyData[date][s] = dailyData[date][s] + 1
        }
      }
    }

    // All-time vote count
    const { count: totalVoters } = await supabase
      .from("market_sentiment_votes")
      .select("user_id", { count: "exact", head: true })

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
