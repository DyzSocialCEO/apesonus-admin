import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CALL (beta) desk.
 *
 * GET   config, days, winners, and the withdrawal queue
 * PATCH prize / on-off, or act on a withdrawal (mark sent with the tx, reject)
 * POST  run the daily tick by hand, for when a cron run was missed
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [config, days, awards, cards, queue] = await Promise.all([
      supabase.from("call_config").select("prize_onus, play_cap, enabled").eq("id", 1).maybeSingle(),
      supabase
        .from("call_days")
        .select("id, opens_at, closes_at, prize_onus, status, top5, settled_at, note")
        .order("opens_at", { ascending: false })
        .limit(14),
      supabase.from("call_day_awards").select("day_id, rank, points, amount_onus").limit(500),
      supabase.from("call_day_cards").select("day_id").limit(5000),
      supabase
        .from("call_withdrawals")
        .select("id, user_id, wallet_address, amount_onus, status, tx_signature, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ])

    const winnersPerDay: Record<string, { rank: number; points: number; amount_onus: number }[]> = {}
    for (const a of (awards.data ?? []) as { day_id: string; rank: number; points: number; amount_onus: number }[]) {
      ;(winnersPerDay[a.day_id] ??= []).push(a)
    }
    const cardsPerDay: Record<string, number> = {}
    for (const c of (cards.data ?? []) as { day_id: string }[]) {
      cardsPerDay[c.day_id] = (cardsPerDay[c.day_id] ?? 0) + 1
    }

    return NextResponse.json({
      config: config.data ?? { prize_onus: 5000, play_cap: 3, enabled: true },
      days: days.data ?? [],
      winnersPerDay,
      cardsPerDay,
      withdrawals: queue.data ?? [],
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
      withdrawal?: { id: number; action: "sent" | "rejected"; tx?: string }
      note?: { dayId: string; line: string }
    }

    if (body.note?.dayId) {
      const supabase = await createAdminClient()
      const line = String(body.note.line ?? "").trim().slice(0, 240)
      const { error } = await supabase
        .from("call_days")
        .update({ note: line || null })
        .eq("id", body.note.dayId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "call_beta.note", {
        day: body.note.dayId,
        cleared: !line,
      })
      return NextResponse.json({ ok: true })
    }

    if (body.withdrawal?.id) {
      const supabase = await createAdminClient()
      const action = body.withdrawal.action
      if (action !== "sent" && action !== "rejected") {
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
      }
      const tx = typeof body.withdrawal.tx === "string" ? body.withdrawal.tx.trim() : ""
      if (action === "sent" && tx.length < 32) {
        return NextResponse.json({ error: "Paste the payout signature first" }, { status: 400 })
      }
      const { data, error } = await supabase
        .from("call_withdrawals")
        .update({
          status: action,
          tx_signature: action === "sent" ? tx : null,
          handled_at: new Date().toISOString(),
        })
        .eq("id", body.withdrawal.id)
        .eq("status", "requested")
        .select("id")
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: "Already handled" }, { status: 409 })
      await logAdminAction(supabase, request, session.username, "call_beta.withdrawal", {
        id: body.withdrawal.id,
        action,
        tx: tx || null,
      })
      return NextResponse.json({ ok: true })
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
