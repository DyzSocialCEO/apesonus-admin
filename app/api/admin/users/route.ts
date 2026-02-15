import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

// GET all users with engagement status
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw error

    // Get active streaks
    const { data: streaks } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, completed_streaks, is_active")
      .eq("is_active", true)

    const streakMap = new Map<string, any>()
    streaks?.forEach((s) => {
      streakMap.set(s.telegram_id, s)
    })

    const enriched = (users || []).map((u) => ({
      ...u,
      streak: streakMap.get(u.telegram_id) || null,
    }))

    return NextResponse.json({ users: enriched })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST - admin actions on users
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, action, amount } = await request.json()
    if (!telegramId || !action) {
      return NextResponse.json({ error: "telegramId and action required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    if (action === "grant_coins") {
      const coinAmount = amount || 50
      await supabase.from("moji_transactions").insert({
        telegram_id: telegramId,
        amount: coinAmount,
        reason: "admin_bonus",
      })
      return NextResponse.json({ success: true, message: `Granted ${coinAmount} coins` })
    }

    if (action === "verify_user") {
      await supabase
        .from("users")
        .update({ is_verified: true, verified_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "User verified" })
    }

    if (action === "unverify_user") {
      await supabase
        .from("users")
        .update({ is_verified: false, verified_at: null })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "Verification removed" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error managing user:", error)
    return NextResponse.json({ error: "Failed to manage user" }, { status: 500 })
  }
}
