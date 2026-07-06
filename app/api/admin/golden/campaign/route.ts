import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/golden/campaign
 *   Launch a raffle campaign. Body:
 *   { sponsor_name?, sponsor_url?, reward_currency:'usdc'|'token', token_mint?,
 *     total_pool_value, spins_pot?, duration_hours, activation_threshold?,
 *     tiers: [{rank_from, rank_to, pct}] }  — tier pct must sum to 100.
 *   Goes live now; ends_at = now + duration_hours.
 *
 * PATCH /api/admin/golden/campaign  { id, action:'draw'|'void'|'end_now' }
 *   draw   → run the weighted draw now (pit_gt_draw).
 *   end_now→ set ends_at to now (cron/draw will pick it up, or draw immediately).
 *   void   → cancel without paying (Embers already stand).
 */
function bad(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const currency = String(b.reward_currency || "")
  if (!["usdc", "token"].includes(currency)) return bad("reward_currency must be usdc or token.")

  const pool = Number(b.total_pool_value)
  const spinsPot = Number(b.spins_pot ?? 0)
  const durationHours = Number(b.duration_hours)
  const threshold = Number(b.activation_threshold ?? 0)
  if (!Number.isFinite(pool) || pool < 0) return bad("total_pool_value invalid.")
  if (!Number.isFinite(durationHours) || durationHours <= 0) return bad("duration_hours must be > 0.")
  if (currency === "token" && !String(b.token_mint || "").trim()) return bad("token_mint required for a token campaign.")

  const tiersIn = Array.isArray(b.tiers) ? b.tiers : []
  if (tiersIn.length === 0) return bad("At least one prize tier is required.")
  const tiers = tiersIn.map((t: any) => ({
    rank_from: Math.max(1, Math.round(Number(t.rank_from) || 1)),
    rank_to: Math.max(1, Math.round(Number(t.rank_to) || 1)),
    pct: Number(t.pct) || 0,
  }))
  for (const t of tiers) if (t.rank_to < t.rank_from) return bad("A tier's rank_to must be >= rank_from.")
  const pctSum = tiers.reduce((a, t) => a + t.pct, 0)
  if (Math.abs(pctSum - 100) > 0.01) return bad(`Tier percentages must sum to 100 (currently ${pctSum}).`)

  try {
    const supabase = await createAdminClient()
    const endsAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
    const { data, error } = await supabase.from("pit_gt_campaigns").insert({
      sponsor_name: typeof b.sponsor_name === "string" ? b.sponsor_name.trim().slice(0, 120) : null,
      sponsor_url: typeof b.sponsor_url === "string" ? b.sponsor_url.trim().slice(0, 300) : null,
      reward_currency: currency,
      token_mint: currency === "token" ? String(b.token_mint).trim() : null,
      total_pool_value: pool,
      spins_pot: Number.isFinite(spinsPot) && spinsPot > 0 ? Math.round(spinsPot) : 0,
      tiers,
      activation_threshold: Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold) : 0,
      starts_at: new Date().toISOString(),
      ends_at: endsAt,
      status: "live",
    }).select("id").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e: any) {
    console.error("[admin/golden/campaign POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown }
  const id = Number(b.id)
  const action = String(b.action || "")
  if (!Number.isFinite(id)) return bad("id required.")

  try {
    const supabase = await createAdminClient()
    if (action === "draw") {
      const { data, error } = await supabase.rpc("pit_gt_draw", { p_campaign: id })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, result: data })
    }
    if (action === "end_now") {
      const { error } = await supabase.from("pit_gt_campaigns")
        .update({ ends_at: new Date().toISOString() }).eq("id", id).eq("status", "live")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (action === "void") {
      const { error } = await supabase.from("pit_gt_campaigns")
        .update({ status: "void", settled_at: new Date().toISOString() }).eq("id", id).eq("status", "live")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (action === "delete") {
      // Full removal: campaign, its entries (cascade), and its reward rows.
      // The operator's undo for test or mistaken campaigns — paid history goes
      // with it, so this asks for intent in the UI.
      await supabase.from("pit_golden_tickets").delete().eq("campaign_id", id)
      const { error } = await supabase.from("pit_gt_campaigns").delete().eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, deleted: id })
    }
    return bad("action must be draw, end_now, void, or delete.")
  } catch (e: any) {
    console.error("[admin/golden/campaign PATCH]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
