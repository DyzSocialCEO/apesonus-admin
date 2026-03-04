import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Top users by total_onus
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, total_onus")
      .order("total_onus", { ascending: false })
      .limit(50)

    // Recent transactions
    const { data: transactions } = await supabase
      .from("onus_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    // Total points in circulation
    const totalPoints = users?.reduce((sum, u) => sum + (u.total_onus || 0), 0) || 0

    return NextResponse.json({
      users: users || [],
      transactions: transactions || [],
      stats: { totalPoints, usersWithPoints: users?.filter((u) => (u.total_onus || 0) > 0).length || 0 },
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// POST - manually award points (trigger updates total_onus)
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, amount, reason } = await request.json()
    if (!telegramId || !amount || !reason) {
      return NextResponse.json({ error: "telegramId, amount, and reason required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Insert transaction — DB trigger auto-updates total_onus
    await supabase.from("onus_transactions").insert({
      telegram_id: telegramId,
      amount,
      reason: `admin_award: ${reason}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
