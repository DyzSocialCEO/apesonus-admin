import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/subscriptions
 *
 * Paginated subscription list with filters. Joins users for display
 * name + premium_status.
 *
 * Query params:
 *   filter: "all" | "active" | "expired" | "revoked" | "genesis" | "standard" | "expiring_soon"
 *   search: text to match against user.display_name / user.email / user.id
 *   page:   1-indexed page number (default 1)
 *   limit:  rows per page (default 50, max 200)
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const filter = (url.searchParams.get("filter") || "all").toLowerCase()
  const search = (url.searchParams.get("search") || "").trim()
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"))
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")))
  const offset = (page - 1) * limit

  try {
    const supabase = await createAdminClient()

    let q = supabase
      .from("premium_subscriptions")
      .select(
        `id, user_id, plan_duration, source, status, starts_at, expires_at,
         sol_amount_lamports, sol_tx_signature, sol_usd_price_at_payment,
         yearly_bonus_cp, granted_by, grant_reason, created_at, revoked_at,
         users!inner(id, display_name, email, premium_status, genesis_holder_number, wallet_address)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // Filters
    if (filter === "active") {
      q = q.eq("status", "active").gt("expires_at", new Date().toISOString())
    } else if (filter === "expired") {
      q = q.eq("status", "expired")
    } else if (filter === "revoked") {
      q = q.eq("status", "revoked")
    } else if (filter === "genesis") {
      q = q.eq("users.premium_status", "genesis")
    } else if (filter === "standard") {
      q = q.eq("users.premium_status", "standard")
    } else if (filter === "expiring_soon") {
      const soon = new Date(Date.now() + 7 * 86_400_000).toISOString()
      q = q
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .lt("expires_at", soon)
    }

    if (search) {
      // Postgres OR across joined user fields. We have to call the
      // search on the joined table fields with the embed table prefix.
      q = q.or(
        `display_name.ilike.%${search}%,email.ilike.%${search}%,id.eq.${search}`,
        { foreignTable: "users" },
      )
    }

    const { data, error, count } = await q
    if (error) throw error

    // Compute stats in a second pass (cheap, single aggregate per metric)
    const [stats] = await Promise.all([computeStats(supabase)])

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      page,
      limit,
      stats,
    })
  } catch (err) {
    console.error("[admin/subscriptions GET]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}

async function computeStats(supabase: Awaited<ReturnType<typeof createAdminClient>>) {
  const nowIso = new Date().toISOString()

  const [active, genesis, standard, expired, revenueRows] = await Promise.all([
    supabase
      .from("premium_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowIso),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("premium_status", "genesis"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("premium_status", "standard"),
    supabase
      .from("premium_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "expired"),
    supabase
      .from("premium_subscriptions")
      .select("sol_amount_lamports, sol_usd_price_at_payment")
      .eq("source", "user_payment")
      .not("sol_amount_lamports", "is", null)
      .not("sol_usd_price_at_payment", "is", null),
  ])

  let revenueUsd = 0
  for (const r of revenueRows.data ?? []) {
    const lamports = Number(r.sol_amount_lamports || 0)
    const price = Number(r.sol_usd_price_at_payment || 0)
    if (lamports > 0 && price > 0) {
      revenueUsd += (lamports / 1_000_000_000) * price
    }
  }

  return {
    activeCount: active.count ?? 0,
    genesisCount: genesis.count ?? 0,
    standardCount: standard.count ?? 0,
    expiredCount: expired.count ?? 0,
    revenueUsd: Math.round(revenueUsd * 100) / 100,
  }
}

/**
 * POST /api/admin/subscriptions
 *
 * Manual grant. Calls assign_subscription with p_source='admin_grant'
 * (real grant, no on-chain payment) or 'admin_test' (no yearly bonus,
 * for fast lifecycle testing).
 *
 * Body:
 *   { userId, duration: 'month'|'year'|'custom', customSeconds?,
 *     source: 'admin_grant'|'admin_test', reason? }
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const userId: string = (body.userId || "").trim()
  const duration: string = (body.duration || "").trim()
  const source: string = body.source === "admin_test" ? "admin_test" : "admin_grant"
  const customSeconds = body.customSeconds != null ? Number(body.customSeconds) : null
  const reason: string | null = body.reason ? String(body.reason).slice(0, 500) : null

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }
  if (!["month", "year", "custom"].includes(duration)) {
    return NextResponse.json(
      { error: "duration must be 'month', 'year', or 'custom'" },
      { status: 400 },
    )
  }
  if (duration === "custom" && (!customSeconds || customSeconds <= 0)) {
    return NextResponse.json(
      { error: "customSeconds required and positive when duration='custom'" },
      { status: 400 },
    )
  }

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("assign_subscription", {
      p_user_id: userId,
      p_duration: duration,
      p_custom_seconds: customSeconds,
      p_source: source,
      p_sol_tx: null,
      p_sol_amount: null,
      p_sol_price: null,
      p_granted_by: session.username,
      p_grant_reason: reason,
    })

    if (error) {
      console.error("[admin/subscriptions POST] RPC failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data

    await logAdminAction(supabase, request, session.username, "subscription.grant", {
      userId,
      duration,
      customSeconds,
      source,
      reason,
      subscriptionId: row?.subscription_id,
      tier: row?.tier,
      genesisHolderNumber: row?.genesis_holder_number,
    })

    return NextResponse.json({
      ok: true,
      subscriptionId: row?.subscription_id,
      expiresAt: row?.expires_at,
      genesisHolderNumber: row?.genesis_holder_number,
      yearlyBonusCp: row?.yearly_bonus_cp,
      tier: row?.tier,
    })
  } catch (err) {
    console.error("[admin/subscriptions POST]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}
