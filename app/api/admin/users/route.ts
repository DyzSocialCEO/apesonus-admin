import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

// GET all users with premium status
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

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("telegram_id, status, expires_at")
      .in("status", ["active", "trial"])

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

      // Delete any existing row first, then insert fresh
      await supabase.from("subscriptions").delete().eq("telegram_id", telegramId)

      const { data, error } = await supabase.from("subscriptions").insert({
        telegram_id: telegramId,
        status: "active",
        plan: "premium",
        amount_paid: 0,
        currency: "USDT",
        payment_method: "admin_grant",
        started_at: now,
        expires_at: expiresAt,
        updated_at: now,
      }).select().single()

      if (error) {
        console.error("[Admin] Insert subscription error:", error)
        return NextResponse.json({ error: "Failed to activate: " + error.message }, { status: 500 })
      }

      console.log("[Admin] Premium activated for", telegramId, data)
      return NextResponse.json({ success: true, message: "Premium activated for 30 days" })
    }

    if (action === "deactivate_premium") {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)

      if (error) {
        console.error("[Admin] Deactivate error:", error)
        return NextResponse.json({ error: "Failed to deactivate: " + error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Premium removed" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error managing user:", error)
    return NextResponse.json({ error: "Failed to manage user" }, { status: 500 })
  }
}
