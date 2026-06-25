import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ═══════════════════════════════════════════════════════════════════════════
// /api/admin/the-read
//   GET  → load the newest Season so the console hydrates from the DB.
//   POST → save | open_signups | advance.
//      save          upsert the current Season as a draft (config only, no
//                    state change). Allowed while the Season is a draft.
//      open_signups  create the Season from the config if it does not exist,
//                    write its call slate, then move it to 'signups' so it
//                    appears for players.
//      advance       step the run state to the next stage, validated server
//                    side against the Season's real state.
//
// Writes go through the cookieless service-role client because the read_
// tables are RLS service-role only. Auth is the admin session.
// ═══════════════════════════════════════════════════════════════════════════

const STATE_ORDER = [
  "draft", "signups", "locked", "filter", "grind", "gauntlet", "settled", "paid",
] as const
type SeasonState = (typeof STATE_ORDER)[number]

function nextState(s: SeasonState): SeasonState | null {
  const i = STATE_ORDER.indexOf(s)
  return i >= 0 && i < STATE_ORDER.length - 1 ? STATE_ORDER[i + 1] : null
}

const STAGE_SET = ["filter", "grind", "gauntlet"]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Coercion helpers, so a bad field can never 500 the database ────────────
const int = (v: any, d = 0) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : d
}
const intMin = (v: any, min: number, d = min) => Math.max(min, int(v, d))
const numMin = (v: any, min: number, d = min) => {
  const n = Number(v)
  return Math.max(min, Number.isFinite(n) ? n : d)
}
const str = (v: any, d = "") => (typeof v === "string" ? v : d)
const strList = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : [])
const intList = (v: any): number[] => (Array.isArray(v) ? v.map((x) => int(x, 0)) : [])

const KINDS = ["DAILY", "WEEKLY", "SPONSORED"]
const PRIZE_MODES = ["climbing", "fixed"]
const FUNDERS = ["house", "sponsor", "split"]
const CALL_TYPES = ["pumpdump", "number", "hit"]

function cleanDial(d: any) {
  const types = strList(d?.types).filter((t) => CALL_TYPES.includes(t))
  return {
    calls: intMin(d?.calls, 0, 0),
    lockSec: intMin(d?.lockSec, 1, 60),
    settleLabel: str(d?.settleLabel, "the window"),
    types: types.length ? types : ["pumpdump"],
  }
}

// Map the console config onto the read_seasons columns.
function configToRow(cfg: any) {
  return {
    title: str(cfg?.title, "SEASON").slice(0, 120),
    kind: KINDS.includes(cfg?.kind) ? cfg.kind : "DAILY",
    sponsored: !!cfg?.sponsored,
    sponsor: str(cfg?.sponsor, "").slice(0, 120),
    entry_ammo: intMin(cfg?.entryAmmo, 0, 250),
    prize_mode: PRIZE_MODES.includes(cfg?.prizeMode) ? cfg.prizeMode : "climbing",
    prize_floor_usd: intMin(cfg?.prizeFloor, 0, 50),
    prize_cap_usd: intMin(cfg?.prizeCap, 0, 200),
    prize_fixed_usd: intMin(cfg?.prizeFixed, 0, 500),
    funder: FUNDERS.includes(cfg?.funder) ? cfg.funder : "house",
    split: intList(cfg?.split),
    slate: strList(cfg?.slate),
    band_pct: numMin(cfg?.bandPct, 0, 2),
    close_full: numMin(cfg?.closeFull, 0, 0.5),
    close_zero: numMin(cfg?.closeZero, 0, 5),
    pts_max: intMin(cfg?.ptsMax, 0, 100),
    pts_floor: intMin(cfg?.ptsFloor, 0, 10),
    burn_pct: numMin(cfg?.burnPct, 0, 20),
    filter_dial: cleanDial(cfg?.filter),
    grind_dial: cleanDial(cfg?.grind),
    gauntlet_dial: cleanDial(cfg?.gauntlet),
    schedule_filter: str(cfg?.scheduleFilter, "11:00").slice(0, 16),
    schedule_grind: str(cfg?.scheduleGrind, "14:00").slice(0, 16),
    schedule_gauntlet: str(cfg?.scheduleGauntlet, "20:00").slice(0, 16),
  }
}

// Map a read_seasons row back to the console config shape.
function rowToConfig(r: any) {
  return {
    title: r.title,
    kind: r.kind,
    sponsored: !!r.sponsored,
    sponsor: r.sponsor || "",
    entryAmmo: Number(r.entry_ammo),
    prizeMode: r.prize_mode,
    prizeFloor: Number(r.prize_floor_usd),
    prizeCap: Number(r.prize_cap_usd),
    prizeFixed: Number(r.prize_fixed_usd),
    funder: r.funder,
    split: Array.isArray(r.split) ? r.split.map((x: any) => Number(x)) : [],
    slate: Array.isArray(r.slate) ? r.slate : [],
    filter: r.filter_dial,
    grind: r.grind_dial,
    gauntlet: r.gauntlet_dial,
    bandPct: Number(r.band_pct),
    closeFull: Number(r.close_full),
    closeZero: Number(r.close_zero),
    ptsMax: Number(r.pts_max),
    ptsFloor: Number(r.pts_floor),
    burnPct: Number(r.burn_pct),
    entrants: 0,
    scheduleFilter: r.schedule_filter,
    scheduleGrind: r.schedule_grind,
    scheduleGauntlet: r.schedule_gauntlet,
  }
}

// Build the call slate from the slate and dials. Structure only: open and
// settle values stay NULL until Phase 4 reads real metrics, so no number is
// invented here. The stage to type and kind mapping matches the player demo.
function buildCalls(seasonId: string, slate: string[], row: any) {
  if (!slate.length) return [] as any[]
  const out: any[] = []
  const stages: { key: string; dial: any }[] = [
    { key: "filter", dial: row.filter_dial },
    { key: "grind", dial: row.grind_dial },
    { key: "gauntlet", dial: row.gauntlet_dial },
  ]
  for (const { key, dial } of stages) {
    const calls = intMin(dial?.calls, 0, 0)
    for (let i = 0; i < calls; i++) {
      const artistId = slate[i % slate.length]
      let type = "pumpdump"
      let kind = "np"
      if (key === "grind") {
        type = "number"
        kind = "streams"
      } else if (key === "gauntlet") {
        type = i % 3 === 2 ? "hit" : "pumpdump"
        kind = "np"
      }
      out.push({
        season_id: seasonId,
        stage: key,
        n: i + 1,
        type,
        artist_id: artistId,
        kind,
        lock_window_sec: intMin(dial?.lockSec, 1, 60),
        settle_label: str(dial?.settleLabel, "the window"),
      })
    }
  }
  return out
}

async function regenerateCalls(supabase: any, seasonId: string, slate: string[], row: any) {
  await supabase.from("read_calls").delete().eq("season_id", seasonId)
  const calls = buildCalls(seasonId, slate, row)
  if (calls.length) await supabase.from("read_calls").insert(calls)
  return calls.length
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createServiceClient()
    const { data: row } = await supabase
      .from("read_seasons")
      .select("*")
      .neq("state", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!row) return NextResponse.json({ season: null })

    const { count } = await supabase
      .from("read_entries")
      .select("id", { count: "exact", head: true })
      .eq("season_id", row.id)

    const { data: standings } = await supabase.rpc("read_standings", { p_season_id: row.id })

    let stageCalls: any[] = []
    if (STAGE_SET.includes(row.state)) {
      const { data: c } = await supabase
        .from("read_calls")
        .select("n, type, artist_id, kind, open_value, settle_value, hit_target, settle_label")
        .eq("season_id", row.id)
        .eq("stage", row.state)
        .order("n", { ascending: true })
      stageCalls = c || []
    }

    return NextResponse.json({
      season: { id: row.id, state: row.state, entrants: Number(count ?? 0), config: rowToConfig(row) },
      standings: Array.isArray(standings) ? standings : [],
      stage_calls: stageCalls,
    })
  } catch (e) {
    console.error("[admin/the-read] GET:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "")
    const seasonId = UUID_RE.test(String(body?.season_id || "")) ? String(body.season_id) : null

    // ── discard: archive this Season so the console clears for a fresh draft ─
    if (action === "discard") {
      if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })
      const { error } = await supabase
        .from("read_seasons")
        .update({ state: "archived", updated_at: new Date().toISOString() })
        .eq("id", seasonId)
      if (error) return NextResponse.json({ error: "discard failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "the_read_discard", {
        season_id: seasonId,
      }).catch(() => {})
      return NextResponse.json({ ok: true, id: seasonId })
    }

    // ── reopen_window: restart the lock clock on the current live stage ──────
    if (action === "reopen_window") {
      if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })
      const { data: cur } = await supabase
        .from("read_seasons")
        .select("state")
        .eq("id", seasonId)
        .maybeSingle()
      if (!cur || !STAGE_SET.includes(cur.state)) {
        return NextResponse.json({ error: "not in a live stage" }, { status: 400 })
      }
      const { error } = await supabase
        .from("read_calls")
        .update({ opened_at: new Date().toISOString() })
        .eq("season_id", seasonId)
        .eq("stage", cur.state)
      if (error) return NextResponse.json({ error: "reopen failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "the_read_reopen_window", {
        season_id: seasonId, stage: cur.state,
      }).catch(() => {})
      return NextResponse.json({ ok: true, id: seasonId, stage: cur.state })
    }

    // ── advance: step the run state ──────────────────────────────────────
    if (action === "advance") {
      if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })
      const { data: cur } = await supabase
        .from("read_seasons")
        .select("id, state, title")
        .eq("id", seasonId)
        .maybeSingle()
      if (!cur) return NextResponse.json({ error: "season not found" }, { status: 404 })

      const next = nextState(cur.state as SeasonState)
      if (!next) return NextResponse.json({ error: "season is closed" }, { status: 400 })
      const want = String(body?.to || "")
      if (want && want !== next) {
        return NextResponse.json({ error: "stale state", state: cur.state, next }, { status: 409 })
      }

      // Settle the stage we are leaving, scoring on real metrics.
      if (STAGE_SET.includes(cur.state)) {
        await supabase.rpc("read_settle_stage", { p_season_id: seasonId, p_stage: cur.state })
      }

      const { error } = await supabase
        .from("read_seasons")
        .update({ state: next, updated_at: new Date().toISOString() })
        .eq("id", seasonId)
        .eq("state", cur.state)
      if (error) return NextResponse.json({ error: "advance failed" }, { status: 500 })

      // Open the stage we are entering so its calls go live with real opens.
      if (STAGE_SET.includes(next)) {
        await supabase.rpc("read_open_stage", { p_season_id: seasonId, p_stage: next })
      }

      // Declare: credit every scorer their points-share of the prize into the
      // cash-out ledger, so they can withdraw it through the normal rail.
      if (next === "paid") {
        await supabase.rpc("read_pay_winners", { p_season_id: seasonId })
      }

      await logAdminAction(supabase, request, session.username, "the_read_advance", {
        season_id: seasonId, from: cur.state, to: next,
      }).catch(() => {})
      return NextResponse.json({ ok: true, id: seasonId, state: next })
    }

    // ── open_stage / settle_stage: manual override if the auto path fails ─
    if (action === "open_stage" || action === "settle_stage") {
      if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })
      const stage = String(body?.stage || "")
      if (!STAGE_SET.includes(stage)) return NextResponse.json({ error: "bad stage" }, { status: 400 })
      const fn = action === "open_stage" ? "read_open_stage" : "read_settle_stage"
      const { data, error } = await supabase.rpc(fn, { p_season_id: seasonId, p_stage: stage })
      if (error) return NextResponse.json({ error: action + " failed" }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "the_read_" + action, {
        season_id: seasonId, stage,
      }).catch(() => {})
      return NextResponse.json({ ok: true, id: seasonId, result: data })
    }

    // ── save and open_signups both need a clean config ──────────────────
    const row = configToRow(body?.config || {})
    const slate = row.slate

    // Resolve the working Season: the one the client holds, if it is still a
    // draft. Anything past draft is locked and cannot be edited or reopened.
    let working: { id: string; state: string } | null = null
    if (seasonId) {
      const { data } = await supabase
        .from("read_seasons")
        .select("id, state")
        .eq("id", seasonId)
        .maybeSingle()
      if (data) working = { id: data.id, state: data.state }
    }
    if (working && working.state !== "draft") {
      return NextResponse.json({ error: "Season is live, dials are locked" }, { status: 409 })
    }

    if (action === "save" || action === "open_signups") {
      let id = working?.id || null

      if (id) {
        const { error } = await supabase
          .from("read_seasons")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("state", "draft")
        if (error) return NextResponse.json({ error: "save failed" }, { status: 500 })
      } else {
        const { data, error } = await supabase
          .from("read_seasons")
          .insert({ ...row, state: "draft", created_by: session.username })
          .select("id")
          .single()
        if (error || !data) return NextResponse.json({ error: "create failed" }, { status: 500 })
        id = data.id
      }

      const calls = await regenerateCalls(supabase, id as string, slate, row)

      if (action === "save") {
        await logAdminAction(supabase, request, session.username, "the_read_save", {
          season_id: id, calls,
        }).catch(() => {})
        return NextResponse.json({ ok: true, id, state: "draft", calls })
      }

      // open_signups: make it visible to players
      const { error: openErr } = await supabase
        .from("read_seasons")
        .update({ state: "signups", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("state", "draft")
      if (openErr) return NextResponse.json({ error: "open failed" }, { status: 500 })

      await logAdminAction(supabase, request, session.username, "the_read_open_signups", {
        season_id: id, calls,
      }).catch(() => {})
      return NextResponse.json({ ok: true, id, state: "signups", calls })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[admin/the-read] POST:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
