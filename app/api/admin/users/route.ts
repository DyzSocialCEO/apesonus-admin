import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

// GET all users with premium status
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Get all users
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw error

    // Get active subscriptions
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("telegram_id, status, expires_at")
      .in("status", ["active", "trial"])

    // Merge premium status
    const subMap = new Map<string, any>()
    subs?.forEach((s) => {
      if (!subMap.has(s.telegram_id) || s.status === "active") {
        subMap.set(s.telegram_id, s)
      }
    })

    const enriched = (users || []).map((u) => ({
      ...u,
      subscription: subMap.get(u.telegram_id) || null,
    }))

    return NextResponse.json({ users: enriched })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST - toggle premium for a user
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, action } = await request.json()
    if (!telegramId || !action) {
      return NextResponse.json({ error: "telegramId and action required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    if (action === "activate_premium") {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()

      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle()

      if (existing) {
        await supabase.from("subscriptions").update({
          status: "active",
          plan: "premium",
          amount_paid: 0,
          payment_method: "admin_grant",
          started_at: now,
          expires_at: expiresAt,
          updated_at: now,
        }).eq("telegram_id", telegramId)
      } else {
        await supabase.from("subscriptions").insert({
          telegram_id: telegramId,
          status: "active",
          plan: "premium",
          amount_paid: 0,
          currency: "USDT",
          payment_method: "admin_grant",
          started_at: now,
          expires_at: expiresAt,
          updated_at: now,
        })
      }

      return NextResponse.json({ success: true, message: "Premium activated" })
    }

    if (action === "deactivate_premium") {
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)

      return NextResponse.json({ success: true, message: "Premium deactivated" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error managing user:", error)
    return NextResponse.json({ error: "Failed to manage user" }, { status: 500 })
  }
}
