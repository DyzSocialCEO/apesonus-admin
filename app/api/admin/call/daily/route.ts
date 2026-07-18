import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE DAILY, admin side.
 *
 * GET   /api/admin/call/daily              recent days, their state, entries, answer
 * POST  /api/admin/call/daily              { action: 'open', day? }  open a day by hand
 * PATCH /api/admin/call/daily              { action: 'resolve', day } force a resolve now
 *
 * The crons already open tomorrow and resolve yesterday on their own. These
 * are the manual overrides: open a specific day early, or resolve one on
 * demand for a dry run. Both call the same RPCs the crons call, so nothing
 * here can diverge from the automatic path.
 */

type Body = Record<string, unknown>

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    const { data: days } = await supabase
      .from("pit_call_daily")
      .select("day, status, closes_at, resolves_at, answer_track_id, pot_carry, summary")
      .order("day", { ascending: false })
      .limit(14)

    // Entry counts per day, and the answer titles, so the desk reads in words.
    const dayKeys = (days || []).map((d) => d.day)
    const counts: Record<string, number> = {}
    const answers: Record<number, { title: string; artist: string }> = {}

    if (dayKeys.length) {
      const { data: tix } = await supabase
        .from("pit_call_daily_tickets").select("day").in("day", dayKeys)
      for (const t of tix || []) counts[t.day] = (counts[t.day] || 0) + 1

      const ansIds = (days || []).map((d) => d.answer_track_id).filter((x): x is number => !!x)
      if (ansIds.length) {
        const { data: tracks } = await supabase.from("tracks").select("id, title, artist").in("id", ansIds)
        for (const t of tracks || []) answers[t.id] = { title: t.title, artist: t.artist }
      }
    }

    return NextResponse.json({
      days: (days || []).map((d) => ({
        day: d.day,
        status: d.status,
        closes_at: d.closes_at,
        resolves_at: d.resolves_at,
        answer_track_id: d.answer_track_id,
        answer: d.answer_track_id ? answers[d.answer_track_id] ?? null : null,
        pot_carry: Number(d.pot_carry) || 0,
        entries: counts[d.day] || 0,
        summary: d.summary,
      })),
    })
  } catch (e) {
    console.error("[admin/call/daily GET]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const b = (await request.json().catch(() => ({}))) as Body
    if (String(b.action) !== "open") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null

    const { data, error } = await supabase.rpc("pit_call_daily_open", day ? { p_for: day } : {})
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, request, session.username, "call.daily.open", { day, result: data })
    return NextResponse.json({ ok: true, result: data })
  } catch (e) {
    console.error("[admin/call/daily POST]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const b = (await request.json().catch(() => ({}))) as Body
    if (String(b.action) !== "resolve") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    }

    const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null
    if (!day) return NextResponse.json({ error: "Which day?" }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("pit_call_daily_resolve", { p_day: day })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const r = (data || {}) as Record<string, unknown>
    if (r.ok === false) {
      const msg =
        r.reason === "too_early" ? "That day hasn't finished yet."
        : r.reason === "not_found" ? "No such day."
        : "Could not resolve."
      return NextResponse.json({ error: msg, ...r }, { status: 409 })
    }

    await logAdminAction(supabase, request, session.username, "call.daily.resolve", { day, result: r })
    return NextResponse.json({ ok: true, result: r })
  } catch (e) {
    console.error("[admin/call/daily PATCH]", e)
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
