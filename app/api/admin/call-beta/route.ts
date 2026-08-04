import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CALL (beta) desk.
 *
 * GET   config, the open week, and recent settled weeks with their winners
 * PATCH prize / play cap / on-off
 * POST  run the weekly tick by hand, for when a cron run was missed
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [config, weeks, awards, cards] = await Promise.all([
      supabase.from("call_config").select("prize_onus, play_cap, enabled").eq("id", 1).maybeSingle(),
      supabase
        .from("call_weeks")
        .select("id, opens_at, closes_at, prize_onus, status, top5, settled_at")
        .order("opens_at", { ascending: false })
        .limit(12),
      supabase.from("call_awards").select("week_id, amount_onus").limit(500),
      supabase.from("call_cards").select("week_id").limit(5000),
    ])

    const winnersPerWeek: Record<string, number> = {}
    for (const a of (awards.data ?? []) as { week_id: string }[]) {
      winnersPerWeek[a.week_id] = (winnersPerWeek[a.week_id] ?? 0) + 1
    }
    const cardsPerWeek: Record<string, number> = {}
    for (const c of (cards.data ?? []) as { week_id: string }[]) {
      cardsPerWeek[c.week_id] = (cardsPerWeek[c.week_id] ?? 0) + 1
    }

    return NextResponse.json({
      config: config.data ?? { prize_onus: 25000, play_cap: 3, enabled: true },
      weeks: weeks.data ?? [],
      winnersPerWeek,
      cardsPerWeek,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as {
      prize_onus?: number
      play_cap?: number
      enabled?: boolean
    }

    const update: Record<string, unknown> = {}
    if (Number.isFinite(body.prize_onus) && Number(body.prize_onus) >= 0) {
      update.prize_onus = Math.floor(Number(body.prize_onus))
    }
    if (Number.isFinite(body.play_cap) && Number(body.play_cap) >= 1) {
      update.play_cap = Math.floor(Number(body.play_cap))
    }
    if (typeof body.enabled === "boolean") update.enabled = body.enabled

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const { error } = await supabase.from("call_config").update(update).eq("id", 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, request, session.username, "call_beta.config", update)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("call_week_tick")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const row = Array.isArray(data) ? data[0] : data
    await logAdminAction(supabase, request, session.username, "call_beta.tick", {
      opened: row?.opened ?? null,
      settled: row?.settled ?? null,
    })
    return NextResponse.json({ ok: true, opened: row?.opened ?? null, settled: row?.settled ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
