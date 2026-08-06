import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The Ward Check desk.
 *
 * GET  — the schedule from yesterday forward, with the vote counts already
 *        counted, so the desk shows what the room actually answered.
 * POST — write or overwrite one day: the line, the answers, and the verdict
 *        that gets printed under yesterday's result.
 * DELETE — drop a scheduled day.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - 14)
  const fromDay = from.toISOString().slice(0, 10)

  const [{ data: checks }, { data: votes }] = await Promise.all([
    supabase
      .from("ward_checks")
      .select("day, line, options, verdict")
      .gte("day", fromDay)
      .order("day", { ascending: true }),
    supabase.from("ward_votes").select("day, choice").gte("day", fromDay).limit(100000),
  ])

  const tally = new Map<string, number[]>()
  for (const v of (votes ?? []) as { day: string; choice: number }[]) {
    const row = tally.get(v.day) ?? []
    row[v.choice] = (row[v.choice] ?? 0) + 1
    tally.set(v.day, row)
  }

  const days = ((checks ?? []) as { day: string; line: string; options: string[]; verdict: string | null }[]).map(
    (c) => {
      const counts = (c.options ?? []).map((_, i) => tally.get(c.day)?.[i] ?? 0)
      return { ...c, counts, total: counts.reduce((a, b) => a + b, 0) }
    },
  )

  return NextResponse.json({ days, today: new Date().toISOString().slice(0, 10) })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { day?: string; line?: string; options?: string[]; verdict?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const day = String(body.day || "").slice(0, 10)
  const line = String(body.line || "").trim().slice(0, 400)
  const options = (Array.isArray(body.options) ? body.options : [])
    .map((o) => String(o || "").trim().slice(0, 60))
    .filter(Boolean)
  const verdict = body.verdict == null ? null : String(body.verdict).trim().slice(0, 300) || null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "bad_day" }, { status: 400 })
  if (line.length < 3) return NextResponse.json({ error: "bad_line" }, { status: 400 })
  if (options.length < 2 || options.length > 4) {
    return NextResponse.json({ error: "bad_options" }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from("ward_checks")
    .upsert({ day, line, options, verdict, updated_at: new Date().toISOString() }, { onConflict: "day" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const day = String(new URL(request.url).searchParams.get("day") || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "bad_day" }, { status: 400 })

  const supabase = await createAdminClient()
  const { error } = await supabase.from("ward_checks").delete().eq("day", day)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
