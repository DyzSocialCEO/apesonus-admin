import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/golden/pool
 *   Seed a reward pool. Body:
 *   { reward_currency: 'usdc'|'token'|'spins', token_mint?, sponsor_name?,
 *     total_tickets, value_min, value_max, total_pool_value, max_reward_spins?,
 *     hit_probability (0..1), track_scope?: number[] }
 *   Enforces the ceilings: value_max >= value_min, a Spins pool cannot exceed
 *   max_reward_spins, and total_pool_value must cover at least one max reward.
 *   tickets_remaining starts at total_tickets; status starts 'live'.
 *
 * PATCH /api/admin/golden/pool  { pool_id, status: 'live'|'paused'|'ended' }
 *   Flip a pool on/off. Ending a pool stops all rolls against it.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const currency = String(b.reward_currency || "")
  if (!["usdc", "token", "spins"].includes(currency)) {
    return NextResponse.json({ error: "reward_currency must be usdc, token, or spins." }, { status: 400 })
  }
  const totalTickets = Number(b.total_tickets)
  const valueMin = Number(b.value_min)
  const valueMax = Number(b.value_max)
  const totalPoolValue = Number(b.total_pool_value)
  const maxRewardSpins = Number(b.max_reward_spins ?? 0)
  const hitProb = Number(b.hit_probability)

  if (!Number.isFinite(totalTickets) || totalTickets < 1) return bad("total_tickets must be at least 1.")
  if (!Number.isFinite(valueMin) || valueMin < 0) return bad("value_min invalid.")
  if (!Number.isFinite(valueMax) || valueMax < valueMin) return bad("value_max must be >= value_min.")
  if (!Number.isFinite(totalPoolValue) || totalPoolValue < valueMax) return bad("total_pool_value must cover at least one max reward.")
  if (!Number.isFinite(hitProb) || hitProb < 0 || hitProb > 1) return bad("hit_probability must be between 0 and 1.")
  if (currency === "token" && !String(b.token_mint || "").trim()) return bad("token_mint is required for a token pool.")
  if (currency === "spins") {
    if (!Number.isFinite(maxRewardSpins) || maxRewardSpins < 1) return bad("max_reward_spins is required for a Spins pool.")
    if (valueMax > maxRewardSpins) return bad("value_max cannot exceed max_reward_spins.")
  }

  let trackScope: number[] | null = null
  if (Array.isArray(b.track_scope) && b.track_scope.length > 0) {
    trackScope = b.track_scope.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    if (trackScope.length === 0) trackScope = null
  }

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.from("pit_golden_pools").insert({
      reward_currency: currency,
      token_mint: currency === "token" ? String(b.token_mint).trim() : null,
      sponsor_name: typeof b.sponsor_name === "string" ? b.sponsor_name.trim().slice(0, 80) : null,
      total_tickets: Math.round(totalTickets),
      tickets_remaining: Math.round(totalTickets),
      value_min: valueMin,
      value_max: valueMax,
      total_pool_value: totalPoolValue,
      value_spent: 0,
      max_reward_spins: currency === "spins" ? Math.round(maxRewardSpins) : 0,
      hit_probability: hitProb,
      track_scope: trackScope,
      status: "live",
    }).select("id").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e: any) {
    console.error("[admin/golden/pool POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as { pool_id?: unknown; status?: unknown }
  const poolId = Number(b.pool_id)
  const status = String(b.status || "")
  if (!Number.isFinite(poolId)) return bad("pool_id required.")
  if (!["live", "paused", "ended"].includes(status)) return bad("status must be live, paused, or ended.")

  try {
    const supabase = await createAdminClient()
    const { error } = await supabase.from("pit_golden_pools").update({ status }).eq("id", poolId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, pool_id: poolId, status })
  } catch (e: any) {
    console.error("[admin/golden/pool PATCH]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
