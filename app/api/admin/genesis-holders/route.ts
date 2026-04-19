import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: list all Genesis Badge holders ordered by holder number.
 *
 * Returns an array of holder rows — the admin panel's holder leaderboard.
 * No rate limiting because this is a read-only, session-gated endpoint
 * that doesn't touch external services.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, onus_balance, total_onus, genesis_holder_number")
      .eq("genesis_badge", true)
      .order("genesis_holder_number", { ascending: true })
      .limit(1000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const holders = (data || []).map((row) => ({
      telegramId: String(row.telegram_id),
      username: row.username || null,
      firstName: row.first_name || null,
      onusBalance: Number(row.onus_balance ?? 0),
      totalOnus: Number(row.total_onus ?? 0),
      holderNumber: Number(row.genesis_holder_number ?? 0),
      isTop100: Number(row.genesis_holder_number ?? 0) <= 100,
    }))

    return NextResponse.json({ holders, count: holders.length })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
