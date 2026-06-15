import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/payout
 *   GET  → the weekly payout desk: current epoch, its purse, the live board
 *          (players, plays this epoch, total NP, leader), the activation gates,
 *          and recent settled weeks.
 *   POST → open | set_purse | preview | close.
 *          "preview" is a read-only dry run (writes nothing). "close" runs the
 *          real pit_close_epoch: it pays the holders and resets the board.
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

  const c = await cfg(supabase)
  const epoch = Number(c.current_epoch_number || 0)
  const minPlayers = Number(c.activation_min_players ?? 300)
  const minPlays = Number(c.activation_min_plays ?? 5000)

  const { data: cur } = await supabase
    .from("pit_epochs")
    .select("epoch_number, status, purse_usd, rollover_in, sponsor_name, winner_artist_id, paid_total, starts_at")
    .eq("epoch_number", epoch).maybeSingle()

  // Live board snapshot.
  const { data: nodeAgg } = await supabase.from("pit_nodes").select("artist_id, np, user_id")
  const totals: Record<string, number> = {}
  const holders = new Set<string>()
  let boardNp = 0
  for (const r of nodeAgg || []) {
    const np = Number(r.np || 0)
    if (np > 0) { totals[r.artist_id] = (totals[r.artist_id] || 0) + np; holders.add(r.user_id); boardNp += np }
  }
  let leader: string | null = null, leaderNp = 0
  for (const [id, np] of Object.entries(totals)) if (np > leaderNp) { leader = id; leaderNp = np }
  const { count: plays } = await supabase
    .from("pit_qualified_plays").select("id", { count: "exact", head: true }).eq("epoch_number", epoch)

  const players = holders.size
  const playsN = plays || 0

  // Recent settled weeks.
  const { data: recent } = await supabase
    .from("pit_epochs")
    .select("epoch_number, status, purse_usd, paid_total, winner_artist_id, snapshot_at")
    .in("status", ["paid", "rolled"]).order("epoch_number", { ascending: false }).limit(8)

  return NextResponse.json({
    epoch_active: !!c.epoch_active && epoch > 0,
    epoch,
    current: cur ? {
      epoch_number: cur.epoch_number, status: cur.status,
      purse: Number(cur.purse_usd || 0), rollover: Number(cur.rollover_in || 0),
      sponsor: cur.sponsor_name || null, starts_at: cur.starts_at,
    } : null,
    board: {
      players, plays: playsN, board_np: Math.round(boardNp),
      leader: name(leader), leader_id: leader, leader_np: Math.round(leaderNp),
    },
    activation: {
      min_players: minPlayers, min_plays: minPlays,
      players_met: players >= minPlayers, plays_met: playsN >= minPlays,
      will_pay: players >= minPlayers && playsN >= minPlays && boardNp > 0,
    },
    recent: (recent || []).map((r: any) => ({
      epoch: r.epoch_number, status: r.status, purse: Number(r.purse_usd || 0),
      paid_total: Number(r.paid_total || 0), winner: name(r.winner_artist_id), snapshot_at: r.snapshot_at,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")

  if (action === "open") {
    const epoch = Number(body.epoch)
    const purse = Math.max(0, Number(body.purse) || 0)
    const sponsor = (body.sponsor ?? "").toString().slice(0, 120)
    if (!Number.isFinite(epoch) || epoch < 1) return NextResponse.json({ error: "valid epoch (>=1) required" }, { status: 400 })
    const { data, error } = await supabase.rpc("pit_open_epoch", { p_epoch: epoch, p_purse: purse, p_sponsor: sponsor })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((data as any)?.error) return NextResponse.json({ error: (data as any).error }, { status: 400 })
    await logAdminAction(supabase, request, session.username, "payout_open_epoch", { epoch, purse })
    return NextResponse.json({ ok: true, result: data })
  }

  if (action === "set_purse") {
    const epoch = Number(body.epoch)
    const purse = Math.max(0, Number(body.purse) || 0)
    const sponsor = (body.sponsor ?? "").toString().slice(0, 120) || null
    if (!Number.isFinite(epoch)) return NextResponse.json({ error: "epoch required" }, { status: 400 })
    const { error } = await supabase.from("pit_epochs").update({ purse_usd: purse, sponsor_name: sponsor }).eq("epoch_number", epoch)
    if (error) return NextResponse.json({ error: "update failed" }, { status: 500 })
    await logAdminAction(supabase, request, session.username, "payout_set_purse", { epoch, purse })
    return NextResponse.json({ ok: true, purse, sponsor })
  }

  if (action === "preview") {
    const epoch = Number(body.epoch)
    if (!Number.isFinite(epoch)) return NextResponse.json({ error: "epoch required" }, { status: 400 })
    const { data, error } = await supabase.rpc("pit_preview_payouts", { p_epoch: epoch })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, preview: data })
  }

  if (action === "close") {
    const epoch = Number(body.epoch)
    if (!Number.isFinite(epoch)) return NextResponse.json({ error: "epoch required" }, { status: 400 })
    const { data, error } = await supabase.rpc("pit_close_epoch", { p_epoch: epoch })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(supabase, request, session.username, "payout_close_epoch", { epoch, result: data })
    return NextResponse.json({ ok: true, result: data })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
