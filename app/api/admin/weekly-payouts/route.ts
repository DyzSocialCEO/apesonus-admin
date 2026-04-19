import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: Weekly Top 10 payouts.
 *
 *   GET   → list payouts, grouped by week_start desc
 *   POST  → mark a rank as paid for a given week
 *
 * Flow:
 *   • Monday 00:00 UTC the reset fires (migration 035) and auto-snapshots
 *     the closing week's top 10 into weekly_top10_payouts as pending rows
 *     (stars_paid=0, paid_at=null).
 *   • Admin visits /dashboard/top10, finds the closed week in the history
 *     section, clicks "Mark Paid" on each rank. Each click POSTs here with
 *     { week_start, rank, telegram_id, stars_paid, notes? }.
 *   • If a row already exists (the usual case post-reset), we UPDATE it.
 *     If no row exists yet (admin paying mid-week before reset), we INSERT
 *     and snapshot username/first_name/onus_earned from the users table at
 *     that moment.
 */

const MAX_STARS_PER_PAYOUT = 100_000
const MAX_NOTES_LEN = 500

interface PayoutRow {
  id: number
  week_start: string
  rank: number
  telegram_id: string
  username: string | null
  first_name: string | null
  onus_earned: number
  stars_paid: number
  paid_at: string | null
  paid_by_admin: string | null
  notes: string | null
  created_at: string
}

// ──────────────────────────────────────────────────────
// GET: list payouts grouped by week
// ──────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(request.url)
    const weekFilter = url.searchParams.get("week")

    const supabase = await createAdminClient()

    let query = supabase
      .from("weekly_top10_payouts")
      .select(
        "id, week_start, rank, telegram_id, username, first_name, onus_earned, stars_paid, paid_at, paid_by_admin, notes, created_at"
      )

    if (weekFilter) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekFilter)) {
        return NextResponse.json({ error: "week param must be YYYY-MM-DD" }, { status: 400 })
      }
      query = query.eq("week_start", weekFilter)
    }

    const { data, error } = await query
      .order("week_start", { ascending: false })
      .order("rank", { ascending: true })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows: PayoutRow[] = (data || []).map((r: any) => ({
      id: Number(r.id),
      week_start: String(r.week_start),
      rank: Number(r.rank),
      telegram_id: String(r.telegram_id),
      username: r.username || null,
      first_name: r.first_name || null,
      onus_earned: Number(r.onus_earned || 0),
      stars_paid: Number(r.stars_paid || 0),
      paid_at: r.paid_at || null,
      paid_by_admin: r.paid_by_admin || null,
      notes: r.notes || null,
      created_at: String(r.created_at),
    }))

    // Group by week_start so the client can render week by week without
    // re-grouping on its end.
    const byWeek: { [key: string]: PayoutRow[] } = {}
    for (const r of rows) {
      if (!byWeek[r.week_start]) byWeek[r.week_start] = []
      byWeek[r.week_start].push(r)
    }

    const weeks = Object.keys(byWeek)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((wk) => {
        const weekRows = byWeek[wk]
        return {
          week_start: wk,
          rows: weekRows,
          total_pending: weekRows.filter((r) => !r.paid_at).length,
          total_paid: weekRows.filter((r) => r.paid_at).length,
          total_stars_paid: weekRows.reduce((a, r) => a + r.stars_paid, 0),
        }
      })

    return NextResponse.json({ weeks })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────
// POST: mark-paid (insert or update)
// ──────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`wp:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const { week_start, rank, telegram_id, stars_paid, notes } = body

    // Validate week_start
    if (typeof week_start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return NextResponse.json({ error: "week_start must be YYYY-MM-DD" }, { status: 400 })
    }

    // Validate rank
    const rankNum = Number(rank)
    if (!Number.isFinite(rankNum) || !Number.isInteger(rankNum) || rankNum < 1 || rankNum > 10) {
      return NextResponse.json({ error: "rank must be an integer 1-10" }, { status: 400 })
    }

    // Validate telegram_id (numeric string, at least 5 digits)
    const telegramIdStr = String(telegram_id || "").trim()
    if (!/^\d{5,}$/.test(telegramIdStr)) {
      return NextResponse.json({ error: "telegram_id must be a numeric string" }, { status: 400 })
    }

    // Validate stars_paid
    const starsNum = Number(stars_paid)
    if (!Number.isFinite(starsNum) || !Number.isInteger(starsNum) || starsNum < 0 || starsNum > MAX_STARS_PER_PAYOUT) {
      return NextResponse.json(
        { error: `stars_paid must be a whole number 0 to ${MAX_STARS_PER_PAYOUT}` },
        { status: 400 }
      )
    }

    // Normalize notes
    const notesStr =
      notes === undefined || notes === null
        ? null
        : String(notes).slice(0, MAX_NOTES_LEN).trim() || null

    const supabase = await createAdminClient()

    // Check if a pending row already exists for (week_start, rank)
    const { data: existing, error: fetchErr } = await supabase
      .from("weekly_top10_payouts")
      .select("id, telegram_id, stars_paid, paid_at, notes")
      .eq("week_start", week_start)
      .eq("rank", rankNum)
      .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    let result: any
    let action: "inserted" | "updated"

    if (existing) {
      // UPDATE path: preserve onus_earned and telegram_id snapshot from reset.
      // If the caller's telegram_id disagrees with the snapshotted one, reject.
      // Admin can override via Supabase SQL editor if they really need to.
      if (String(existing.telegram_id) !== telegramIdStr) {
        return NextResponse.json(
          {
            error: `Rank ${rankNum} for week ${week_start} is already snapshotted for telegram_id ${existing.telegram_id}. Manual override required via SQL editor.`,
          },
          { status: 409 }
        )
      }

      const { data: updated, error: updErr } = await supabase
        .from("weekly_top10_payouts")
        .update({
          stars_paid: starsNum,
          paid_at: new Date().toISOString(),
          paid_by_admin: session.username,
          notes: notesStr !== null ? notesStr : existing.notes,
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      result = updated
      action = "updated"
    } else {
      // INSERT path: fresh row, snapshot from users.
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("username, first_name, weekly_onus_earned")
        .eq("telegram_id", telegramIdStr)
        .maybeSingle()

      if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 })
      if (!userRow) {
        return NextResponse.json({ error: "Telegram user not found" }, { status: 404 })
      }

      const { data: inserted, error: insErr } = await supabase
        .from("weekly_top10_payouts")
        .insert({
          week_start,
          rank: rankNum,
          telegram_id: Number(telegramIdStr),
          username: userRow.username,
          first_name: userRow.first_name,
          onus_earned: Number(userRow.weekly_onus_earned || 0),
          stars_paid: starsNum,
          paid_at: new Date().toISOString(),
          paid_by_admin: session.username,
          notes: notesStr,
        })
        .select()
        .single()

      if (insErr) {
        if ((insErr as any).code === "23505") {
          return NextResponse.json(
            { error: "Race with weekly reset snapshot. Refresh and retry." },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
      result = inserted
      action = "inserted"
    }

    // Audit log
    await logAdminAction(supabase, request, session.username, "weekly_payouts.record", {
      action,
      week_start,
      rank: rankNum,
      telegram_id: telegramIdStr,
      stars_paid: starsNum,
      paid_by_admin: session.username,
    })

    return NextResponse.json({ success: true, action, payout: result })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
