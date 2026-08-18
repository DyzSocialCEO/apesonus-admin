import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CREATOR SIDE, the desk half.
 *
 * GET   the settings, plus what the three dose states currently look like
 * PATCH any of the settings
 * POST  { what: "state", session, state } to overturn one judgement by hand
 *
 * Nothing here is ever shown to a patient. The thresholds are the only thing
 * standing between the Creator Pool and a farm, and a farm that can read them
 * is a farm that can walk around them.
 */

interface Cfg {
  pool_pct: number
  min_payout_cents: number
  max_per_listener_per_day: number
  max_per_listener_per_case_per_day: number
  self_play_counts: boolean
  max_from_one_network_per_day: number
  burst_window_minutes: number
  burst_max: number
  monetization_on: boolean
}

const FALLBACK: Cfg = {
  pool_pct: 20,
  min_payout_cents: 500,
  max_per_listener_per_day: 3,
  max_per_listener_per_case_per_day: 2,
  self_play_counts: false,
  max_from_one_network_per_day: 12,
  burst_window_minutes: 10,
  burst_max: 8,
  monetization_on: false,
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function read(raw: unknown): Cfg {
  try {
    const v = raw && typeof raw === "object" ? (raw as any) : JSON.parse(String(raw ?? "{}"))
    return {
      pool_pct: num(v.pool_pct, 20, 0, 100),
      min_payout_cents: num(v.min_payout_cents, 500, 0, 1000000),
      max_per_listener_per_day: num(v.max_per_listener_per_day, 3, 1, 500),
      max_per_listener_per_case_per_day: num(v.max_per_listener_per_case_per_day, 2, 1, 100),
      self_play_counts: v.self_play_counts === true,
      max_from_one_network_per_day: num(v.max_from_one_network_per_day, 12, 1, 5000),
      burst_window_minutes: num(v.burst_window_minutes, 10, 1, 1440),
      burst_max: num(v.burst_max, 8, 1, 5000),
      monetization_on: v.monetization_on === true,
    }
  } catch {
    return { ...FALLBACK }
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [{ data: cfg }, { data: rows }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "creator_config").maybeSingle(),
      supabase.from("ward_case_sessions").select("id, state, reason, dosed_at").not("dosed_at", "is", null),
    ])

    const list = rows ?? []
    const held = list
      .filter((r: any) => r.state === "pending")
      .slice(0, 30)
      .map((r: any) => ({ id: String(r.id), reason: r.reason ?? null, at: r.dosed_at }))

    return NextResponse.json({
      config: read(cfg?.value),
      present: cfg != null,
      counts: {
        qualified: list.filter((r: any) => r.state === "qualified").length,
        pending: list.filter((r: any) => r.state === "pending").length,
        invalid: list.filter((r: any) => r.state === "invalid").length,
      },
      held,
    })
  } catch (e) {
    console.error("[admin/creator] GET failed:", e)
    return NextResponse.json({ error: "Could not read the creator settings." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings").select("value").eq("key", "creator_config").maybeSingle()
    if (row == null) {
      return NextResponse.json(
        { error: "The creator_config row does not exist yet. Run 131_qualified_doses.sql first." },
        { status: 409 },
      )
    }

    const current = read(row.value)
    const next: Cfg = { ...current }

    if ("pool_pct" in body) next.pool_pct = num(body.pool_pct, current.pool_pct, 0, 100)
    if ("min_payout_cents" in body) next.min_payout_cents = num(body.min_payout_cents, current.min_payout_cents, 0, 1000000)
    if ("max_per_listener_per_day" in body) next.max_per_listener_per_day = num(body.max_per_listener_per_day, current.max_per_listener_per_day, 1, 500)
    if ("max_per_listener_per_case_per_day" in body) next.max_per_listener_per_case_per_day = num(body.max_per_listener_per_case_per_day, current.max_per_listener_per_case_per_day, 1, 100)
    if ("max_from_one_network_per_day" in body) next.max_from_one_network_per_day = num(body.max_from_one_network_per_day, current.max_from_one_network_per_day, 1, 5000)
    if ("burst_window_minutes" in body) next.burst_window_minutes = num(body.burst_window_minutes, current.burst_window_minutes, 1, 1440)
    if ("burst_max" in body) next.burst_max = num(body.burst_max, current.burst_max, 1, 5000)
    if ("self_play_counts" in body) next.self_play_counts = body.self_play_counts === true
    if ("monetization_on" in body) next.monetization_on = body.monetization_on === true

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "creator_config", value: JSON.stringify(next) }, { onConflict: "key" })
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "creator.settings", {
      before: current,
      after: next,
    })

    return NextResponse.json({ config: next, saved: true })
  } catch (e) {
    console.error("[admin/creator] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const id = String(body?.session ?? "").trim()
    const state = String(body?.state ?? "").trim()
    if (!id || !["qualified", "invalid", "pending"].includes(state)) {
      return NextResponse.json({ error: "Which play, and to what?" }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const { error } = await supabase
      .from("ward_case_sessions")
      .update({
        state,
        judged_at: state === "pending" ? null : new Date().toISOString(),
        reason: state === "pending" ? null : `set by hand by ${session.username}`,
      })
      .eq("id", id)
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "creator.judge", { id, state })
    return NextResponse.json({ saved: true })
  } catch (e) {
    console.error("[admin/creator] POST failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}
