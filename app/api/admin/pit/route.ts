import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ═══════════════════════════════════════════════════════════════════════════
// /api/admin/pit
//   GET  → inspector (faction standings, per-user lookup) + prize desk data
//          (dials, epochs with purse/sponsor/status, current epoch).
//   POST → set_purse | set_dial | close_epoch. Dials are clamped to safe
//          ranges server-side, so nobody can push a dangerous value through.
// Auth: admin session. Reads anything, writes only the prize controls.
// ═══════════════════════════════════════════════════════════════════════════

const ROSTER: Record<string, string> = {
  "chartnobyl-bro": "Chartnobyl Bro", "coinalisa": "Coinalisa",
  "lola-likwidity": "Lola Likwidity", "mcbagholder": "McBagholder",
  "dj-dustwallet": "DJ Dustwallet", "shilliam-dafoe": "Shilliam Dafoe", "satosheek": "Satosheek",
}
const GRACE_H = 24, BLEED_H = 24
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The danger guard. Every tweakable dial with its safe floor and ceiling and a
// one-line reason. Values outside the range get clamped, never rejected silently.
const DIAL_RANGE: Record<string, { min: number; max: number; note: string }> = {
  skill_pct:              { min: 0.5,  max: 0.9,    note: "Below 0.5 the war becomes a lottery; above 0.9 winning means nothing." },
  per_node_cap_pct:       { min: 0.02, max: 0.10,   note: "Too high reopens the one-wallet drain; too low makes skill barely beat average." },
  activation_min_players: { min: 1,    max: 100000, note: "Too low lets a thin board pay real money; too high and real launch weeks never pay." },
  activation_min_plays:   { min: 0,    max: 1e7,    note: "Same idea as players: the floor that blocks empty-board farming." },
  np_difficulty_floor:    { min: 50,   max: 100000, note: "Too low and the first play mints a jackpot; too high and discovery feels pointless." },
  grace_hours:            { min: 1,    max: 168,    note: "Short grace punishes players; long grace stops the Ammo moving." },
  bleed_hours:            { min: 1,    max: 168,    note: "How long a node takes to bleed out once grace ends." },
  hourly_play_cap_per_artist: { min: 1, max: 1000,  note: "Too high lets whales farm; too low blocks real fans." },
  daily_play_cap:         { min: 1,    max: 100000, note: "Daily ceiling on earning plays per account." },
  payout_dust_floor_usd:  { min: 0,    max: 100,    note: "Payouts below this are skipped and roll forward." },
}

function clampDial(key: string, raw: number): { value: number; clamped: boolean; note?: string } {
  const r = DIAL_RANGE[key]
  if (!r) return { value: raw, clamped: false }
  const value = Math.min(r.max, Math.max(r.min, raw))
  return { value, clamped: value !== raw, note: r.note }
}

async function readConfig(supabase: any): Promise<Record<string, any>> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
  try { return JSON.parse(data?.value || "{}") } catch { return {} }
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()

    const { data: nodeAgg } = await supabase.from("pit_nodes").select("artist_id, np")
    const totals: Record<string, number> = {}, players: Record<string, number> = {}
    for (const r of nodeAgg || []) {
      const np = Number(r.np || 0)
      totals[r.artist_id] = (totals[r.artist_id] || 0) + np
      if (np > 0) players[r.artist_id] = (players[r.artist_id] || 0) + 1
    }
    const { data: stats } = await supabase.from("pit_artist_stats").select("artist_id, lifetime_streams")
    const streams: Record<string, number> = {}
    for (const s of stats || []) streams[s.artist_id] = Number(s.lifetime_streams || 0)

    const idArr = Object.keys(ROSTER).concat(Object.keys(totals), Object.keys(streams))
    const ids = Array.from(new Set(idArr))
    const factions = ids
      .map((id) => ({ artist_id: id, name: ROSTER[id] || id, total_np: totals[id] || 0, players: players[id] || 0, lifetime_streams: streams[id] || 0 }))
      .sort((a, b) => b.total_np - a.total_np)

    const totalNp = Object.values(totals).reduce((a, b) => a + b, 0)
    const { count: qpCount } = await supabase.from("pit_qualified_plays").select("id", { count: "exact", head: true })

    const cfg = await readConfig(supabase)
    const currentEpoch = Number(cfg.current_epoch_number || 0)

    // Epoch window around the current one for the purse desk.
    const lo = Math.max(1, currentEpoch - 1), hi = currentEpoch + 6
    const { data: epochs } = await supabase
      .from("pit_epochs")
      .select("epoch_number, status, purse_usd, sponsor_name, rollover_in, winner_artist_id, paid_total, total_board_np, activated, skill_pct, war_pct, cap_pct, snapshot_at")
      .gte("epoch_number", lo).lte("epoch_number", hi).order("epoch_number", { ascending: true })

    const dials = Object.keys(DIAL_RANGE).map((k) => ({
      key: k, value: cfg[k], min: DIAL_RANGE[k].min, max: DIAL_RANGE[k].max, note: DIAL_RANGE[k].note,
    }))

    // Optional per-user lookup
    const url = new URL(request.url)
    const userQ = (url.searchParams.get("user") || "").trim()
    let userBlock: any = null
    if (userQ) {
      let uid: string | null = null
      if (UUID_RE.test(userQ)) uid = userQ
      else {
        const { data: byName } = await supabase.from("users").select("id").ilike("display_name", `%${userQ}%`).limit(1)
        if (byName && byName[0]) uid = byName[0].id
        if (!uid) {
          const { data: byEmail } = await supabase.from("users").select("id").ilike("email", `%${userQ}%`).limit(1)
          if (byEmail && byEmail[0]) uid = byEmail[0].id
        }
      }
      if (!uid) userBlock = { query: userQ, found: false }
      else {
        const { data: bal } = await supabase.from("pit_ammo_balances").select("balance").eq("user_id", uid).maybeSingle()
        const { data: em } = await supabase.from("pit_embers").select("embers").eq("user_id", uid).maybeSingle()
        const { data: nodes } = await supabase.from("pit_nodes").select("artist_id, np, last_play_at").eq("user_id", uid)
        const now = Date.now()
        const userNodes = (nodes || []).map((n: any) => {
          let state = "grace", detail = GRACE_H
          if (n.last_play_at) {
            const h = (now - new Date(n.last_play_at).getTime()) / 3.6e6
            if (h < GRACE_H) { state = "grace"; detail = GRACE_H - h }
            else if (h < GRACE_H + BLEED_H) { state = "bleeding"; detail = 1 - (h - GRACE_H) / BLEED_H }
            else { state = "dead"; detail = 0 }
          }
          return { artist_id: n.artist_id, name: ROSTER[n.artist_id] || n.artist_id, np: Number(n.np), state, detail }
        }).sort((a: any, b: any) => b.np - a.np)
        userBlock = { query: userQ, found: true, user_id: uid, ammo: Number(bal?.balance ?? 0), embers: Number(em?.embers ?? 0), nodes: userNodes }
      }
    }

    return NextResponse.json({
      factions, totals: { total_np: totalNp, qualified_plays: qpCount || 0 },
      current_epoch: currentEpoch, dials, epochs: epochs || [], user: userBlock,
    })
  } catch (e) {
    console.error("[admin/pit] GET:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()
    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (action === "set_purse") {
      const epoch = Number(body.epoch)
      const purse = Math.max(0, Number(body.purse_usd) || 0)
      const sponsor = (body.sponsor_name ?? "").toString().slice(0, 120) || null
      if (!epoch) return NextResponse.json({ error: "epoch required" }, { status: 400 })
      const { error } = await supabase.from("pit_epochs").update({ purse_usd: purse, sponsor_name: sponsor }).eq("epoch_number", epoch)
      if (error) return NextResponse.json({ error: "update failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "pit_set_purse", { epoch, purse, sponsor }).catch(() => {})
      return NextResponse.json({ ok: true, epoch, purse_usd: purse, sponsor_name: sponsor })
    }

    if (action === "set_dial") {
      const key = String(body.key || "")
      if (!(key in DIAL_RANGE)) return NextResponse.json({ error: "unknown or non-tweakable dial" }, { status: 400 })
      const { value, clamped, note } = clampDial(key, Number(body.value))
      const cfg = await readConfig(supabase)
      cfg[key] = value
      if (key === "skill_pct") cfg["war_pct"] = Math.round((1 - value) * 100) / 100  // keep the two pots summing to 1
      const { error } = await supabase.from("app_settings").update({ value: JSON.stringify(cfg) }).eq("key", "pit_config")
      if (error) return NextResponse.json({ error: "update failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "pit_set_dial", { key, value, clamped }).catch(() => {})
      return NextResponse.json({ ok: true, key, value, clamped, note: clamped ? note : undefined })
    }

    if (action === "close_epoch") {
      const epoch = Number(body.epoch)
      if (!epoch) return NextResponse.json({ error: "epoch required" }, { status: 400 })
      const { data, error } = await supabase.rpc("pit_close_epoch", { p_epoch: epoch })
      if (error) return NextResponse.json({ error: "close failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "pit_close_epoch", { epoch }).catch(() => {})
      return NextResponse.json({ ok: true, result: data })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[admin/pit] POST:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
