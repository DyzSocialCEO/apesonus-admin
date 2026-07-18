import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CALL DESK.
 *
 * GET    /api/admin/call            sessions, knobs, live counted plays, tickets
 * POST   /api/admin/call            create or edit a session
 * PATCH  /api/admin/call            settle a session, or write the knobs
 * DELETE /api/admin/call?id=<id>    scrap an unsettled session
 *
 * The hiding rule is player-facing only. This desk shows raw counted plays for
 * any session, at any time, because the operator has to be able to see the
 * board they are running. Nothing here is ever proxied to a player.
 *
 * Tickets stay sealed until the window closes, and that guard is here rather
 * than in the page. Whoever can read tickets during an open window can read
 * what the room called before calling it themselves.
 */

type Body = Record<string, unknown>

const DEFAULT_TIERS = { full_recovery: 40, remission: 25, breakthrough: 20, progress: 15 }

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const url = new URL(request.url)
    const asked = Number(url.searchParams.get("session"))

    const [{ data: sessions }, { data: cfgRow }, { data: catalogue }] = await Promise.all([
      supabase.from("pit_call_sessions").select("*").order("session_no", { ascending: false }).limit(24),
      supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle(),
      supabase.from("pit_call_catalogue").select("track_id, title, artist, artist_id"),
    ])

    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(cfgRow?.value || "{}") } catch {}

    const num = (k: string, d: number) => {
      const v = Number(cfg[k])
      return Number.isFinite(v) ? v : d
    }
    const knobs = {
      call_enabled: cfg.call_enabled === true,
      call_ticket_price: num("call_ticket_price", 200),
      call_daily_price: num("call_daily_price", 50),
      call_tickets_per_user: num("call_tickets_per_user", 5),
      call_play_cap: num("call_play_cap", 20),
      call_daily_floor: num("call_daily_floor", 20),
      call_tier_pct: (cfg.call_tier_pct as Record<string, number>) || DEFAULT_TIERS,
      ammo_per_usd: cfg.ammo_per_usd ?? null,
    }

    const rows = (sessions || []) as Record<string, unknown>[]
    const focusId =
      Number.isFinite(asked) && asked > 0
        ? asked
        : Number(
            (rows.find((r) => r.status === "locked" || r.status === "running") ||
              rows.find((r) => r.status === "open") ||
              rows[0])?.id ?? 0,
          )

    let chart: unknown[] = []
    let tickets: unknown[] = []
    let pot = 0
    let ticketsSealed = false

    if (focusId) {
      const focus = rows.find((r) => Number(r.id) === focusId)

      // Raw counted plays. Operator only, on purpose.
      const { data: counted } = await supabase.rpc("pit_counted_plays", {
        p_from: focus?.week_starts_at,
        p_to: focus?.week_ends_at,
      })
      const byTrack = new Map<number, number>()
      for (const c of (counted || []) as { track_id: number; counted: number }[]) {
        byTrack.set(c.track_id, Number(c.counted) || 0)
      }
      chart = (catalogue || [])
        .map((t) => ({ ...t, counted: byTrack.get(t.track_id) || 0 }))
        .sort((a, b) => b.counted - a.counted || a.track_id - b.track_id)
        .map((t, i) => ({ rank: i + 1, ...t }))

      const { data: tix } = await supabase
        .from("pit_call_tickets")
        .select("id, user_id, pick_1, pick_2, pick_3, pick_4, pick_5, spins_paid, tier_won, spins_won, fund_share_usd, created_at")
        .eq("session_id", focusId)
        .order("created_at", { ascending: true })

      pot =
        (tix || []).reduce((a, t) => a + (Number(t.spins_paid) || 0), 0) +
        (Number(focus?.spins_pot_carry) || 0)

      // Sealed until the window shuts. An open window plus a readable ticket
      // list is an insider looking at the answers before writing his own.
      const closesAt = focus?.call_closes_at ? new Date(String(focus.call_closes_at)).getTime() : 0
      ticketsSealed = focus?.status === "open" && Date.now() < closesAt
      tickets = ticketsSealed ? [] : tix || []
    }

    return NextResponse.json({
      sessions: rows,
      focus: focusId,
      knobs,
      chart,
      tickets,
      tickets_sealed: ticketsSealed,
      pot_spins: pot,
      catalogue_size: (catalogue || []).length,
    })
  } catch (e) {
    console.error("[admin/call GET]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const b = (await request.json().catch(() => ({}))) as Body
    const supabase = await createAdminClient()

    const callOpens = isoOrNull(b.call_opens_at)
    const callCloses = isoOrNull(b.call_closes_at)
    const weekStarts = isoOrNull(b.week_starts_at)
    const weekEnds = isoOrNull(b.week_ends_at)
    const fund = Number(b.recovery_fund_usdc)

    if (!callOpens || !callCloses || !weekStarts || !weekEnds) {
      return NextResponse.json({ error: "All four dates are required." }, { status: 400 })
    }
    if (new Date(callCloses) <= new Date(callOpens)) {
      return NextResponse.json({ error: "The window has to close after it opens." }, { status: 400 })
    }
    if (new Date(weekEnds) <= new Date(weekStarts)) {
      return NextResponse.json({ error: "The week has to end after it starts." }, { status: 400 })
    }
    if (new Date(callCloses) > new Date(weekStarts)) {
      return NextResponse.json(
        { error: "The window must close before the week starts. Everyone calls blind." },
        { status: 400 },
      )
    }
    if (!Number.isFinite(fund) || fund < 0) {
      return NextResponse.json({ error: "Recovery Fund invalid." }, { status: 400 })
    }

    const id = Math.floor(Number(b.id) || 0)

    if (id > 0) {
      const { data: existing } = await supabase
        .from("pit_call_sessions").select("status").eq("id", id).maybeSingle()
      if (!existing) return NextResponse.json({ error: "No such session." }, { status: 404 })
      if (existing.status === "settled") {
        return NextResponse.json({ error: "That session is settled. It stays as it is." }, { status: 409 })
      }

      const patch: Body = {
        call_opens_at: callOpens, call_closes_at: callCloses,
        week_starts_at: weekStarts, week_ends_at: weekEnds,
        recovery_fund_usdc: fund,
      }
      if (typeof b.status === "string" && ["open", "locked", "running"].includes(b.status)) {
        patch.status = b.status
      }

      const { error } = await supabase.from("pit_call_sessions").update(patch).eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 409 })

      await logAdminAction(supabase, request, session.username, "call.session.edit", { id, ...patch })
      return NextResponse.json({ ok: true, id })
    }

    const sessionNo = Math.floor(Number(b.session_no) || 0)
    if (!(sessionNo > 0)) return NextResponse.json({ error: "Session number required." }, { status: 400 })

    const { data, error } = await supabase
      .from("pit_call_sessions")
      .insert({
        session_no: sessionNo,
        call_opens_at: callOpens, call_closes_at: callCloses,
        week_starts_at: weekStarts, week_ends_at: weekEnds,
        recovery_fund_usdc: fund,
        status: "open",
      })
      .select("id").single()

    if (error) {
      // The partial unique indexes from 059 are doing their job here.
      const msg = error.message.includes("pit_call_sessions_one_open")
        ? "There's already a session open for calling. Close or scrap it first."
        : error.message.includes("session_no")
          ? "That session number is taken."
          : error.message
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    await logAdminAction(supabase, request, session.username, "call.session.create", {
      id: data.id, session_no: sessionNo, fund,
    })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e) {
    console.error("[admin/call POST]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const b = (await request.json().catch(() => ({}))) as Body
    const supabase = await createAdminClient()
    const action = String(b.action || "")

    if (action === "settle") {
      const id = Math.floor(Number(b.id) || 0)
      if (!(id > 0)) return NextResponse.json({ error: "Which session?" }, { status: 400 })

      const { data, error } = await supabase.rpc("pit_call_settle", { p_session: id })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const r = (data || {}) as Record<string, unknown>
      if (r.ok === false) {
        const msg =
          r.reason === "too_early" ? "The week isn't over yet."
          : r.reason === "no_chart" ? "No chart to settle. Nothing counted this week."
          : r.reason === "not_found" ? "No such session."
          : "Could not settle."
        return NextResponse.json({ error: msg, ...r }, { status: 409 })
      }

      await logAdminAction(supabase, request, session.username, "call.session.settle", { id, result: r })
      return NextResponse.json({ ok: true, result: r })
    }

    if (action === "knobs") {
      const { data: row } = await supabase
        .from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(row?.value || "{}") } catch {}

      const patch: Record<string, unknown> = {}
      const ints = ["call_ticket_price", "call_daily_price", "call_tickets_per_user", "call_play_cap", "call_daily_floor"]
      for (const k of ints) {
        if (b[k] === undefined) continue
        const v = Math.floor(Number(b[k]))
        if (!Number.isFinite(v)) return NextResponse.json({ error: `${k} invalid.` }, { status: 400 })
        // call_play_cap at 0 or below means no cap, so it is allowed to go
        // negative. Nothing else may.
        if (v < 0 && k !== "call_play_cap") return NextResponse.json({ error: `${k} can't be negative.` }, { status: 400 })
        patch[k] = v
      }
      if (typeof b.call_enabled === "boolean") patch.call_enabled = b.call_enabled

      if (b.call_tier_pct && typeof b.call_tier_pct === "object") {
        const t = b.call_tier_pct as Record<string, unknown>
        const out: Record<string, number> = {}
        let sum = 0
        for (const k of ["full_recovery", "remission", "breakthrough", "progress"]) {
          const v = Number(t[k])
          if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Tier splits invalid." }, { status: 400 })
          out[k] = v
          sum += v
        }
        if (sum > 100) {
          return NextResponse.json({ error: `Splits add to ${sum}%. The pot isn't that big.` }, { status: 400 })
        }
        patch.call_tier_pct = out
      }

      if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 })

      const merged = { ...cfg, ...patch }
      const { error } = await supabase
        .from("app_settings")
        .update({ value: JSON.stringify(merged), updated_at: new Date().toISOString() })
        .eq("key", "pit_config")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await logAdminAction(supabase, request, session.username, "call.knobs", patch)
      return NextResponse.json({ ok: true, knobs: patch })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    console.error("[admin/call PATCH]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const id = Math.floor(Number(new URL(request.url).searchParams.get("id")) || 0)
    if (!(id > 0)) return NextResponse.json({ error: "Which session?" }, { status: 400 })

    const { data: s } = await supabase
      .from("pit_call_sessions").select("status, session_no").eq("id", id).maybeSingle()
    if (!s) return NextResponse.json({ error: "No such session." }, { status: 404 })
    if (s.status === "settled") {
      return NextResponse.json({ error: "Settled sessions stay on the record." }, { status: 409 })
    }

    // Refund every ticket before the session goes. Tickets cascade on delete,
    // so a scrap without this quietly keeps the Spins.
    const { data: tix } = await supabase
      .from("pit_call_tickets").select("user_id, spins_paid").eq("session_id", id)

    let refunded = 0
    for (const t of tix || []) {
      const { error } = await supabase.rpc("pit_grant_ammo", {
        p_user_id: t.user_id,
        p_amount: Number(t.spins_paid) || 0,
        p_reason: "call_scrapped",
        p_actor: `admin:call_scrap:${id}`,
      })
      if (!error) refunded += Number(t.spins_paid) || 0
    }

    const { error } = await supabase.from("pit_call_sessions").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, request, session.username, "call.session.scrap", {
      id, session_no: s.session_no, tickets: (tix || []).length, spins_refunded: refunded,
    })
    return NextResponse.json({ ok: true, refunded, tickets: (tix || []).length })
  } catch (e) {
    console.error("[admin/call DELETE]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
