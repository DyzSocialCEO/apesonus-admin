import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Conviction Desk API.
 *
 * GET  /api/admin/conviction
 *   The Desk snapshot: every contest (open first, then recent), and for the
 *   focus contest (?contest=id, default = newest open) the live board —
 *   symbol, frozen add-time mcap, live mcap/liquidity, age — plus call counts
 *   and the pot-exposure line (max liability is ALWAYS pot_ceiling_usd, known
 *   before the board opened).
 *
 * POST /api/admin/conviction
 *   Create a contest. Every dial in the body is optional — omitted dials take
 *   the Diamond defaults baked into the schema. Body:
 *   { label?, entry_spins?, target_prize_usd?, pot_ceiling_usd?, max_winners?,
 *     call_ceiling_mcap?, floor_pct?, final_mcap?, days?, liq_floor_usd?,
 *     snapshot_hour_utc?, window_mode: 'daily'|'test', test_minutes? }
 *   'daily' → board opens now, locks at the next 11:50 UTC (the daily reset).
 *   'test'  → board opens now, locks in test_minutes (watch the loop fast).
 *   Config is FROZEN on the row at creation — presets are defaults, not code.
 *
 * DELETE /api/admin/conviction?contest=id
 *   Operator reset for a contest that hasn't settled: voids it and clears its
 *   board. Refuses if any calls exist (that's Phase 2+ territory — voiding a
 *   contest with paid entries needs the refund path, not a delete).
 */

function nextDailyLockUTC(): Date {
  const now = new Date()
  const lock = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 50, 0))
  if (lock.getTime() <= now.getTime()) lock.setUTCDate(lock.getUTCDate() + 1)
  return lock
}

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const url = new URL(request.url)

    const { data: contests } = await supabase
      .from("conviction_contests").select("*")
      .order("created_at", { ascending: false }).limit(25)

    const focusId = num(url.searchParams.get("contest"))
      ?? contests?.find((c: any) => c.status === "open")?.id
      ?? contests?.[0]?.id

    let board: any[] = []
    let callCount = 0
    if (focusId) {
      const { data: b } = await supabase
        .from("conviction_board")
        .select("token_mint, symbol, name, logo, launch_ts, mcap_at_add, liquidity_at_add, last_mcap, last_liquidity, last_seen_at, added_at")
        .eq("contest_id", focusId)
        .order("added_at", { ascending: false })
        .limit(200)
      board = b || []
      const { count } = await supabase
        .from("conviction_calls").select("id", { count: "exact", head: true })
        .eq("contest_id", focusId)
      callCount = count || 0
    }

    const focus = (contests || []).find((c: any) => c.id === focusId) || null
    const exposure = focus ? {
      max_liability_usd: Number(focus.pot_ceiling_usd),
      full_prizes_possible: Math.min(
        Number(focus.max_winners),
        Math.floor(Number(focus.pot_ceiling_usd) / Math.max(1, Number(focus.target_prize_usd)))
      ),
    } : null

    return NextResponse.json({ contests: contests || [], focus, board, call_count: callCount, exposure })
  } catch (e: any) {
    console.error("[admin/conviction GET]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const b = await request.json().catch(() => ({})) as Record<string, unknown>

    const mode = b.window_mode === "test" ? "test" : "daily"
    const opensAt = new Date()
    let closesAt: Date
    if (mode === "test") {
      const mins = Math.max(1, Math.min(1440, num(b.test_minutes) ?? 10))
      closesAt = new Date(opensAt.getTime() + mins * 60000)
    } else {
      closesAt = nextDailyLockUTC()
    }

    // Only pass dials the operator actually set — the schema holds the
    // Diamond defaults, so an empty body IS the Diamond preset.
    const row: Record<string, unknown> = {
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      status: "open",
    }
    if (typeof b.label === "string" && b.label.trim()) row.label = b.label.trim().slice(0, 60)
    for (const k of ["entry_spins", "target_prize_usd", "pot_ceiling_usd", "max_winners",
                     "call_ceiling_mcap", "floor_pct", "final_mcap", "days",
                     "liq_floor_usd", "snapshot_hour_utc"] as const) {
      const v = num(b[k]); if (v !== undefined) row[k] = v
    }

    const { data, error } = await supabase.from("conviction_contests").insert(row).select("*").single()
    if (error) throw error
    return NextResponse.json({ ok: true, contest: data })
  } catch (e: any) {
    console.error("[admin/conviction POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const url = new URL(request.url)
    const id = num(url.searchParams.get("contest"))
    if (!id) return NextResponse.json({ error: "contest id required" }, { status: 400 })

    const { count } = await supabase
      .from("conviction_calls").select("id", { count: "exact", head: true }).eq("contest_id", id)
    if ((count || 0) > 0) return NextResponse.json({ error: "Contest has paid calls — voiding needs the refund path, not a reset." }, { status: 409 })

    await supabase.from("conviction_board").delete().eq("contest_id", id)
    const { error } = await supabase.from("conviction_contests")
      .update({ status: "void" }).eq("id", id).neq("status", "settled")
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[admin/conviction DELETE]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
