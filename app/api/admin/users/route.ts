import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { awardOnus } from "@/lib/award-onus"
import { adminOnusRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

    const { data: streaks } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, completed_streaks, is_active")
      .eq("is_active", true)

    const streakMap = new Map<string, any>()
    if (streaks) {
      for (const s of streaks) {
        streakMap.set(s.telegram_id, s)
      }
    }

    const enriched = (users || []).map((u) => ({
      ...u,
      streak: streakMap.get(u.telegram_id) || null,
    }))

    return NextResponse.json({ users: enriched })
  } catch (error: any) {
    console.error("GET /api/admin/users error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limit — matches /api/admin/onus hardening so a stolen session
    // cannot drain the supply via this endpoint either.
    const ip = getClientIp(request)
    const { success } = await adminOnusRatelimit().limit(`admin-users:${ip}`)
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. This endpoint allows 3 requests per minute." },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { telegramId, action, amount, reason } = body

    if (!telegramId || !action) {
      return NextResponse.json({ error: "telegramId and action required" }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const actor = session.username || "unknown"

    // ────────────────────────────────────────────
    // GRANT COINS — with per-call 1M cap + audit log
    // ────────────────────────────────────────────
    if (action === "grant_coins") {
      const parsedAmount = parseInt(String(amount ?? 100), 10)
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1_000_000) {
        return NextResponse.json(
          { error: "Amount must be a positive integer up to 1,000,000" },
          { status: 400 }
        )
      }
      const reasonTag = `admin_bonus[${actor}]${reason ? `: ${reason}` : ""}`
      const ok = await awardOnus(supabase, telegramId, parsedAmount, reasonTag, `admin_${Date.now()}`)
      if (!ok) {
        return NextResponse.json({ error: "Failed to grant ONUS — check if user exists or supply cap reached" }, { status: 500 })
      }
      await logAdminAction(supabase, request, actor, "users.grant_coins", {
        target_telegram_id: telegramId,
        amount: parsedAmount,
        reason: reason || null,
      })
      return NextResponse.json({ success: true, message: `Granted ${parsedAmount} $ONUS` })
    }

    // grant_premium and revoke_premium removed on the Founders Pass pivot
    // (migration 024). verification_counter was dropped and verification_tier
    // is constrained to ('free','wagmi'). Any lingering admin-UI caller of
    // those actions now gets a clean 410.
    if (action === "grant_premium" || action === "revoke_premium") {
      return NextResponse.json(
        { error: "Gone. Premium tiers were removed. Use /api/admin/genesis-holders for badge management." },
        { status: 410 }
      )
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error: any) {
    console.error("POST /api/admin/users error:", error)
    return NextResponse.json({ error: `Server error: ${error?.message || "Unknown"}` }, { status: 500 })
  }
}
