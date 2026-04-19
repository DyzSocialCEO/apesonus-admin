import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: Genesis Window status + start/close controls.
 *
 * Single source of truth is migration 032's app_settings.genesis_badge_config
 * row and the genesis_status view. This route is a thin UI adapter that:
 *   - GET  → returns the current view row in admin-panel shape
 *   - POST → calls open_genesis_window() or close_genesis_window() SQL fns
 *
 * The previous implementation wrote to a separate app_settings.genesis_window
 * key that the main app never read. That drift has been resolved — all reads
 * and writes now flow through the 032-era config + functions.
 */

const WINDOW_DAYS = 45

async function readStatus(supabase: Awaited<ReturnType<typeof createAdminClient>>) {
  // genesis_status view returns a single row with all race state.
  const { data: statusRow } = await supabase
    .from("genesis_status")
    .select("threshold, max_holders, started_at, closed, is_open, holders_issued, slots_left, days_left")
    .maybeSingle()

  const threshold   = Number(statusRow?.threshold ?? 10000)
  const maxHolders  = Number(statusRow?.max_holders ?? 100)
  const startedAt   = statusRow?.started_at ?? null
  const closed      = statusRow?.closed === true
  const isOpen      = statusRow?.is_open === true
  const slotsLeft   = Number(statusRow?.slots_left ?? maxHolders)
  const daysLeft    = statusRow?.days_left ?? null
  const issued      = Number(statusRow?.holders_issued ?? 0)

  // Derive admin-panel shape from view data.
  let state: "not_started" | "active" | "expired"
  if (!startedAt) state = "not_started"
  else if (isOpen) state = "active"
  else state = "expired"

  const endsAt = startedAt
    ? new Date(new Date(startedAt).getTime() + WINDOW_DAYS * 86400000).toISOString()
    : null

  return {
    state,
    startedAt,
    endsAt,
    daysRemaining: daysLeft,
    closed: closed || state === "expired",
    windowDays: WINDOW_DAYS,
    genesisBadgeCount: issued,
    threshold,
    maxHolders,
    slotsLeft,
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const status = await readStatus(supabase)
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`gw:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { action } = await request.json()
    const supabase = await createAdminClient()
    const before = await readStatus(supabase)

    if (action === "start") {
      if (before.startedAt) {
        return NextResponse.json({ error: "Window already started" }, { status: 409 })
      }

      // Call the SQL function — records started_at = NOW() + closed = false.
      const { error } = await supabase.rpc("open_genesis_window")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await logAdminAction(supabase, request, session.username, "genesis_window.start", {
        startedAt: new Date().toISOString(),
        windowDays: WINDOW_DAYS,
      })

      const after = await readStatus(supabase)
      return NextResponse.json({ success: true, ...after })
    }

    if (action === "close") {
      if (!before.startedAt) {
        return NextResponse.json({ error: "Window has not started" }, { status: 400 })
      }

      const { error } = await supabase.rpc("close_genesis_window")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await logAdminAction(supabase, request, session.username, "genesis_window.close", {
        startedAt: before.startedAt,
        closedAt: new Date().toISOString(),
      })

      const after = await readStatus(supabase)
      return NextResponse.json({ success: true, ...after })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
