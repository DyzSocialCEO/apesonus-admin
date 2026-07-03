import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/pool  { week_start?, sponsor_name, pool_spins }
 *
 * Sets (or updates) the co-sign reward pool for a week. Defaults to the
 * current Monday-UTC week. A pool that has already settled is left alone.
 */
function currentWeekStartUTC(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const off = day === 0 ? 6 : day - 1
  const ws = new Date(now)
  ws.setUTCDate(now.getUTCDate() - off)
  ws.setUTCHours(0, 0, 0, 0)
  return ws.toISOString().split("T")[0]
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    week_start?: string; sponsor_name?: string; pool_spins?: unknown
  }
  const week = (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)) ? body.week_start : currentWeekStartUTC()
  const spins = Number(body.pool_spins)
  if (!Number.isFinite(spins) || spins < 0) {
    return NextResponse.json({ error: "pool_spins must be a non-negative number." }, { status: 400 })
  }
  const sponsor = typeof body.sponsor_name === "string" ? body.sponsor_name.trim().slice(0, 80) : null

  try {
    const supabase = await createAdminClient()
    const { data: existing } = await supabase
      .from("pit_cosign_pools").select("status").eq("week_start", week).maybeSingle()
    if (existing?.status === "settled") {
      return NextResponse.json({ error: "That week is already settled." }, { status: 409 })
    }

    const { error } = await supabase
      .from("pit_cosign_pools")
      .upsert({ week_start: week, sponsor_name: sponsor, pool_spins: Math.round(spins), status: "set" },
              { onConflict: "week_start" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, week_start: week, sponsor, pool_spins: Math.round(spins) })
  } catch (e: any) {
    console.error("[admin/cosign/pool]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
