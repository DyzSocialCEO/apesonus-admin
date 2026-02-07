import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100)

    if (error) throw error

    // Get usernames for each sub
    const telegramIds = subs?.map((s) => s.telegram_id) || []
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, username, first_name")
      .in("telegram_id", telegramIds)

    const userMap = new Map<string, any>()
    users?.forEach((u) => userMap.set(u.telegram_id, u))

    const enriched = (subs || []).map((s) => ({
      ...s,
      user: userMap.get(s.telegram_id) || null,
    }))

    // Stats
    const active = subs?.filter((s) => s.status === "active").length || 0
    const totalRevenue = subs?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0

    return NextResponse.json({
      subscriptions: enriched,
      stats: { total: subs?.length || 0, active, totalRevenue },
    })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
