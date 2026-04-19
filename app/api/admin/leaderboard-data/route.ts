import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: read current leaderboard data (both boards).
 * Returns rows from hall_of_fame_top100 and weekly_top10 views.
 *
 * This endpoint is read-only and session-gated. It returns data
 * regardless of whether the feature flags are on — admin always
 * sees the real numbers so you can verify before flipping flags.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const [hofRes, wklRes] = await Promise.all([
      supabase
        .from("hall_of_fame_top100")
        .select("rank, telegram_id, username, first_name, total_onus, genesis_badge, genesis_holder_number")
        .order("rank", { ascending: true }),
      supabase
        .from("weekly_top10")
        .select("rank, telegram_id, username, first_name, weekly_onus, genesis_badge")
        .order("rank", { ascending: true }),
    ])

    if (hofRes.error) return NextResponse.json({ error: hofRes.error.message }, { status: 500 })
    if (wklRes.error) return NextResponse.json({ error: wklRes.error.message }, { status: 500 })

    const hallOfFame = (hofRes.data || []).map((r) => ({
      rank: Number(r.rank),
      telegramId: String(r.telegram_id),
      username: r.username || null,
      firstName: r.first_name || null,
      totalOnus: Number(r.total_onus || 0),
      genesisBadge: r.genesis_badge === true,
      genesisHolderNumber: r.genesis_holder_number ?? null,
    }))

    const weeklyTop10 = (wklRes.data || []).map((r) => ({
      rank: Number(r.rank),
      telegramId: String(r.telegram_id),
      username: r.username || null,
      firstName: r.first_name || null,
      weeklyOnus: Number(r.weekly_onus || 0),
      genesisBadge: r.genesis_badge === true,
    }))

    return NextResponse.json({ hallOfFame, weeklyTop10 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
