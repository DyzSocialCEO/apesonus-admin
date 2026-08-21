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

    // Live columns. Source-of-truth set established post-migrations 045
    // (user_streaks dropped, streak fields moved onto users row) and
    // v2_001 (premium_status enum). verification_tier kept in the select
    // for diagnostic visibility only — UI does not read it (legacy CHECK
    // constraint blocks 'standard'/'genesis' writes).
    const { data: users, error } = await supabase
      .from("users")
      .select(`
        id, email, display_name, avatar_url, total_onus,
        premium_status, verification_tier, premium_expires_at,
        is_genesis_holder, genesis_active, has_paid,
        genesis_holder_number, genesis_code,
        wallet_address, wallet_chain, auth_method,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw error

    // WHAT A PATIENT IS DURING BETA. Spins and Embers belong to an economy
    // that no longer exists in the app, so the desk stopped asking for them.
    // Doses, devices and the flag are what this panel is for now.
    const ids = (users || []).map((u) => u.id)
    const doses: Record<string, number> = {}
    const lastDose: Record<string, string> = {}
    const devices: Record<string, number> = {}
    const flags: Record<string, string> = {}

    if (ids.length) {
      const [state, dev, flg, recent] = await Promise.all([
        supabase.from("ward_spin_state").select("user_id, lifetime_doses").in("user_id", ids),
        supabase.from("ward_devices").select("user_id, device_id").in("user_id", ids),
        supabase.from("ward_flags").select("user_id, status").in("user_id", ids),
        // Bounded to this page of patients, so the 1000 row page limit cannot
        // silently freeze a number the way it has on this panel before.
        supabase
          .from("ward_doses")
          .select("user_id, taken_at")
          .in("user_id", ids)
          .order("taken_at", { ascending: false })
          .limit(1000),
      ])

      for (const r of state.data || []) doses[r.user_id] = Number(r.lifetime_doses || 0)
      for (const r of dev.data || []) devices[r.user_id] = (devices[r.user_id] || 0) + 1
      for (const r of flg.data || []) flags[r.user_id] = String(r.status || "ok")
      for (const r of recent.data || []) {
        if (!lastDose[r.user_id]) lastDose[r.user_id] = String(r.taken_at)
      }
    }

    const enriched = (users || []).map((u) => ({
      ...u,
      doses: doses[u.id] || 0,
      devices: devices[u.id] || 0,
      flag: flags[u.id] || "ok",
      lastDose: lastDose[u.id] || null,
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
        { error: "Gone. Premium tiers and Genesis Badge were removed. The app is fully free." },
        { status: 410 }
      )
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error: any) {
    console.error("POST /api/admin/users error:", error)
    return NextResponse.json({ error: `Server error: ${error?.message || "Unknown"}` }, { status: 500 })
  }
}
