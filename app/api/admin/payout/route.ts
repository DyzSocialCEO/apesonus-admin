import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/payout — the Drop Desk (drop model).
 *   GET  → live drop state (accrued 70% pool, target, momentum, holders,
 *          board NP), the displayed pool / target / pending seed dials,
 *          the current leader, and recent released drops.
 *   POST → set_pool | set_target | set_seed | preview | release.
 *          "preview" is a read-only dry run (writes nothing).
 *          "release" runs pit_release_drop: pays every holder by
 *          NP × Embers, logs the drop, resets the accrual window.
 *          Positions are never wiped.
 */

const ROSTER: Record<string, string> = {
  "chartnobyl-bro": "Chartnobyl Bro", "coinalisa": "Coinalisa", "lola-likwidity": "Lola Likwidity",
  "mcbagholder": "McBagholder", "dj-dustwallet": "DJ Dustwallet", "shilliam-dafoe": "Shilliam Dafoe", "satosheek": "Satosheek",
}
const name = (id: string | null) => (id ? ROSTER[id] || id : null)

async function cfg(supabase: any): Promise<Record<string, any>> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
  try { return JSON.parse(data?.value || "{}") } catch { return {} }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  const { data: ds } = await supabase.rpc("pit_drop_state")

  // Leader on the board right now.
  const { data: nodeAgg } = await supabase.from("pit_nodes").select("artist_id, np")
  const totals: Record<string, number> = {}
  for (const r of nodeAgg || []) {
    const np = Number(r.np || 0)
    if (np > 0) totals[r.artist_id] = (totals[r.artist_id] || 0) + np
  }
  let leaderId: string | null = null, leaderNp = 0
  for (const [id, np] of Object.entries(totals)) if (np > leaderNp) { leaderId = id; leaderNp = np }

  // Recent released drops.
  const { data: recent } = await supabase
    .from("pit_drops")
    .select("drop_number, pool_usd, accrued_usd, seed_usd, paid_total, recipients, released_at")
    .order("drop_number", { ascending: false }).limit(8)

  return NextResponse.json({
    drop: ds ? {
      number: Number((ds as any).current_drop || 1),
      accrued: Number((ds as any).accrued_usd || 0),
      target: Number((ds as any).target_usd || 0),
      momentum_pct: Number((ds as any).momentum_pct || 0),
      season_pool: Number((ds as any).season_pool_usd || 0),
      pending_seed: Number((ds as any).pending_seed_usd || 0),
      holders: Number((ds as any).holders || 0),
      board_np: Number((ds as any).board_np || 0),
    } : null,
    leader: leaderId ? { name: name(leaderId), id: leaderId, np: Math.round(leaderNp) } : null,
    recent: (recent || []).map((r: any) => ({
      drop: r.drop_number, pool: Number(r.pool_usd || 0), accrued: Number(r.accrued_usd || 0),
      seed: Number(r.seed_usd || 0), paid_total: Number(r.paid_total || 0),
      recipients: Number(r.recipients || 0), released_at: r.released_at,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")

  // ── config dials ──
  if (action === "set_pool" || action === "set_target" || action === "set_seed") {
    const map: Record<string, string> = { set_pool: "season_pool_usd", set_target: "drop_target_usd", set_seed: "pending_seed_usd" }
    const key = map[action]
    const val = Math.max(0, Number(body.value) || 0)
    if (action === "set_target" && val < 0.01) return NextResponse.json({ error: "target must be > 0" }, { status: 400 })
    const c = await cfg(supabase)
    c[key] = val
    const { error } = await supabase.from("app_settings").update({ value: JSON.stringify(c) }).eq("key", "pit_config")
    if (error) return NextResponse.json({ error: "update failed" }, { status: 500 })
    await logAdminAction(supabase, request, session.username, "drop_" + action, { [key]: val })
    return NextResponse.json({ ok: true, [key]: val })
  }

  // ── preview (read-only) ──
  if (action === "preview") {
    const seed = Math.max(0, Number(body.seed) || 0)
    const { data, error } = await supabase.rpc("pit_preview_drop", { p_seed_usd: seed })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, preview: data })
  }

  // ── release (writes) ──
  if (action === "release") {
    const seed = Math.max(0, Number(body.seed) || 0)
    const { data, error } = await supabase.rpc("pit_release_drop", { p_seed_usd: seed })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data && (data as any).released === false) {
      return NextResponse.json({ error: `Nothing to release (${(data as any).reason || "empty"})`, result: data }, { status: 400 })
    }
    await logAdminAction(supabase, request, session.username, "drop_release", { seed, result: data })
    return NextResponse.json({ ok: true, result: data })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
