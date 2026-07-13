import { NextResponse } from "next/server"
import { createAdminClient, createServiceClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminOnusRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/ammo
 *
 * Ammo ledger overview: outstanding balance, lifetime sold (confirmed
 * purchases, zero until the on-chain rail ships in 1B), lifetime granted,
 * lifetime spent, top holders, and recent grants/purchases.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Cookieless service client: the cookie-bound one can downgrade off
    // service_role (documented in lib/supabase.ts) and render every stat as
    // a silent zero. Stats must never lie.
    const supabase = createServiceClient()

    // Outstanding Ammo + top holders.
    const errors: string[] = []
    const { data: balances, error: balancesErr } = await supabase
      .from("pit_ammo_balances")
      .select("user_id, balance")
      .order("balance", { ascending: false })

    if (balancesErr) errors.push(`balances: ${balancesErr.message}`)
    let outstanding = 0
    let holders = 0
    for (const b of balances || []) {
      outstanding += Number(b.balance || 0)
      if (Number(b.balance || 0) > 0) holders++
    }

    // Attach display info to the top 50 holders.
    const topIds = (balances || []).filter(b => Number(b.balance || 0) > 0).slice(0, 50).map(b => b.user_id)
    let topHolders: any[] = []
    if (topIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, email, wallet_address")
        .in("id", topIds)
      const byId = new Map((users || []).map(u => [u.id, u]))
      topHolders = topIds.map(id => {
        const u = byId.get(id)
        const bal = (balances || []).find(b => b.user_id === id)?.balance || 0
        return {
          user_id: id,
          balance: Number(bal),
          display_name: u?.display_name || null,
          email: u?.email || null,
          wallet_address: u?.wallet_address || null,
        }
      })
    }

    // Lifetime sold (confirmed purchases).
    const { data: sold, error: soldErr } = await supabase
      .from("pit_ammo_purchases")
      .select("ammo_amount, usd_cents")
      .eq("status", "confirmed")
    if (soldErr) errors.push(`sold: ${soldErr.message}`)
    let ammoSold = 0
    let usdCents = 0
    for (const s of sold || []) {
      ammoSold += Number(s.ammo_amount || 0)
      usdCents += Number(s.usd_cents || 0)
    }

    // Lifetime granted.
    const { data: grantRows, error: grantsErr } = await supabase
      .from("pit_ammo_grants")
      .select("amount")
    if (grantsErr) errors.push(`grants: ${grantsErr.message}`)
    let ammoGranted = 0
    for (const g of grantRows || []) ammoGranted += Number(g.amount || 0)

    // Lifetime spent (each Ammo play costs 1).
    const { count: ammoSpent } = await supabase
      .from("pit_qualified_plays")
      .select("*", { count: "exact", head: true })
      .eq("source", "ammo")

    // Free daily plays served (lifetime).
    const { count: freeServed } = await supabase
      .from("pit_qualified_plays")
      .select("*", { count: "exact", head: true })
      .eq("source", "free_daily")

    // Recent grants + purchases.
    const { data: recentGrants } = await supabase
      .from("pit_ammo_grants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    const { data: recentPurchases } = await supabase
      .from("pit_ammo_purchases")
      .select("*")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({
      errors: errors.length ? errors : undefined,
      stats: {
        outstanding,
        holders,
        ammoSold,
        usdGross: (usdCents / 100),
        ammoGranted,
        ammoSpent: ammoSpent || 0,
        freeServed: freeServed || 0,
      },
      topHolders,
      recentGrants: recentGrants || [],
      recentPurchases: recentPurchases || [],
    })
  } catch (error) {
    console.error("[admin/ammo] GET error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

/**
 * POST /api/admin/ammo
 *
 * Grant free Ammo to a user. Identify by userId (UUID) or email.
 * Rate limited and hard-capped, same posture as the $ONUS mint route.
 * Ammo is non-refundable by design, so a grant is the only way to issue
 * credit outside a purchase — every grant is ledgered and audited.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminOnusRatelimit().limit(`ammo-grant:${ip}`)
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Grant endpoint allows 3 requests per minute." },
        { status: 429 }
      )
    }

    const { userId, email, amount, reason } = await request.json()
    if ((!userId && !email) || !amount || !reason) {
      return NextResponse.json(
        { error: "amount, reason, and one of userId/email are required" },
        { status: 400 }
      )
    }

    const parsed = parseInt(amount)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
      return NextResponse.json(
        { error: "Amount must be a positive integer up to 1,000,000 Ammo" },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Resolve the target user.
    let targetId: string | null = userId || null
    if (!targetId && email) {
      const { data: u } = await supabase
        .from("users").select("id").eq("email", email).maybeSingle()
      targetId = u?.id || null
    } else if (targetId) {
      const { data: u } = await supabase
        .from("users").select("id").eq("id", targetId).maybeSingle()
      if (!u) targetId = null
    }

    if (!targetId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const actor = session.username || "unknown"
    const { data: newBalance, error: grantErr } = await supabase.rpc("pit_grant_ammo", {
      p_user_id: targetId,
      p_amount: parsed,
      p_reason: reason,
      p_actor: actor,
    })

    if (grantErr) {
      console.error("[admin/ammo] grant failed:", grantErr)
      return NextResponse.json({ error: "Grant failed" }, { status: 500 })
    }

    await logAdminAction(supabase, request, actor, "ammo.grant", {
      target_user_id: targetId,
      amount: parsed,
      reason,
    })

    return NextResponse.json({ success: true, amountGranted: parsed, newBalance: Number(newBalance) })
  } catch (error) {
    console.error("[admin/ammo] POST error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
