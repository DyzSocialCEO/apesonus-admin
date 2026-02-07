import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Top users by moji points
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, moji_points")
      .order("moji_points", { ascending: false })
      .limit(50)

    // Recent transactions
    const { data: transactions } = await supabase
      .from("moji_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    // Total points in circulation
    const totalPoints = users?.reduce((sum, u) => sum + (u.moji_points || 0), 0) || 0

    return NextResponse.json({
      users: users || [],
      transactions: transactions || [],
      stats: { totalPoints, usersWithPoints: users?.filter((u) => (u.moji_points || 0) > 0).length || 0 },
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// POST - manually award points
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, amount, reason } = await request.json()
    if (!telegramId || !amount || !reason) {
      return NextResponse.json({ error: "telegramId, amount, and reason required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Record transaction
    await supabase.from("moji_transactions").insert({
      telegram_id: telegramId,
      amount,
      reason: `admin_award: ${reason}`,
    })

    // Increment user points
    await supabase.rpc("increment_moji_points", {
      user_telegram_id: telegramId,
      points_to_add: amount,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
