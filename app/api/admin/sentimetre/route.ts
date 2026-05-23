import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/sentimetre  (Vibe Check Tier 2 question manager)
 *
 * GET    — list every question, grouped into three sections:
 *            scheduled (today + future)
 *            bank      (active_date IS NULL)
 *            archive   (past, with aggregate response counts)
 *
 * POST   — create a question; optionally schedule directly.
 *            body: { question, options[4], active_date? }
 *
 * Two more route files in this folder handle individual questions:
 *   [id]/route.ts         — PATCH (edit/reschedule/unschedule), DELETE
 *
 * Schema reference (migration 051):
 *   sentimetre_questions(id, question, options jsonb[4], active_date, created_at, updated_at)
 *   sentimetre_responses(id, user_id, question_id, option_index, response_date, weight, created_at)
 *   Partial UNIQUE on active_date WHERE NOT NULL — at most one live Q per date.
 */

type QuestionRow = {
  id: string
  question: string
  options: string[]
  active_date: string | null
  created_at: string
  updated_at: string
}

type EnrichedQuestion = QuestionRow & {
  response_count: number
  aggregate: [number, number, number, number]
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const today = new Date().toISOString().split("T")[0]

    // Pull every question. At launch volume this is small — full scan is fine.
    const { data: questions, error } = await supabase
      .from("sentimetre_questions")
      .select("id, question, options, active_date, created_at, updated_at")
      .order("active_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (error) throw error

    // Aggregate response counts per question. Two queries: one for totals,
    // one for option breakdown. Both indexed (idx_sr_question and
    // idx_sr_question_option from migration 051).
    const ids = (questions || []).map((q) => q.id)
    const responseTotals = new Map<string, number>()
    const optionAggregates = new Map<string, [number, number, number, number]>()

    if (ids.length) {
      const { data: rows } = await supabase
        .from("sentimetre_responses")
        .select("question_id, option_index")
        .in("question_id", ids)

      for (const r of rows || []) {
        const qid = r.question_id as string
        const idx = r.option_index as number
        responseTotals.set(qid, (responseTotals.get(qid) || 0) + 1)
        if (!optionAggregates.has(qid)) {
          optionAggregates.set(qid, [0, 0, 0, 0])
        }
        if (idx >= 0 && idx <= 3) {
          const arr = optionAggregates.get(qid)!
          arr[idx] = arr[idx] + 1
        }
      }
    }

    const enrich = (q: QuestionRow): EnrichedQuestion => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : [],
      response_count: responseTotals.get(q.id) || 0,
      aggregate: optionAggregates.get(q.id) || [0, 0, 0, 0],
    })

    const scheduled: EnrichedQuestion[] = []
    const bank: EnrichedQuestion[] = []
    const archive: EnrichedQuestion[] = []

    for (const q of questions || []) {
      const enriched = enrich(q as QuestionRow)
      if (!q.active_date) {
        bank.push(enriched)
      } else if (q.active_date >= today) {
        scheduled.push(enriched)
      } else {
        archive.push(enriched)
      }
    }

    // Scheduled: ascending by date so today is first
    scheduled.sort((a, b) => (a.active_date || "").localeCompare(b.active_date || ""))
    // Archive: descending by date (most recent past first)
    archive.sort((a, b) => (b.active_date || "").localeCompare(a.active_date || ""))

    return NextResponse.json({ scheduled, bank, archive, today })
  } catch (error) {
    console.error("[admin/sentimetre GET]", error)
    return NextResponse.json({ error: "Failed to load questions" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create a new question, optionally scheduled
// ─────────────────────────────────────────────────────────────────────────────

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`admin-sentimetre:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await request.json().catch(() => null) as
      | { question?: unknown; options?: unknown; active_date?: unknown }
      | null
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

    const question = typeof body.question === "string" ? body.question.trim() : ""
    if (question.length < 1 || question.length > 280) {
      return NextResponse.json({ error: "Question must be 1–280 characters" }, { status: 400 })
    }

    const rawOptions = body.options
    if (!Array.isArray(rawOptions) || rawOptions.length !== 4) {
      return NextResponse.json({ error: "Exactly 4 options required" }, { status: 400 })
    }
    const options: string[] = []
    for (const o of rawOptions) {
      if (typeof o !== "string" || !o.trim()) {
        return NextResponse.json({ error: "Each option must be a non-empty string" }, { status: 400 })
      }
      const trimmed = o.trim()
      if (trimmed.length > 200) {
        return NextResponse.json({ error: "Each option must be 1–200 characters" }, { status: 400 })
      }
      options.push(trimmed)
    }

    const activeDate = body.active_date
    if (activeDate !== undefined && activeDate !== null && !isValidDate(activeDate)) {
      return NextResponse.json({ error: "active_date must be YYYY-MM-DD" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // If scheduling on creation, refuse the schedule when the date is
    // already taken. The partial UNIQUE in migration 051 would also catch
    // this, but checking explicitly lets us return a friendly error.
    if (typeof activeDate === "string") {
      const { data: existing } = await supabase
        .from("sentimetre_questions")
        .select("id")
        .eq("active_date", activeDate)
        .maybeSingle()
      if (existing) {
        return NextResponse.json(
          { error: `A question is already scheduled for ${activeDate}. Unschedule it first or pick another date.` },
          { status: 409 },
        )
      }
    }

    const insertPayload: Record<string, unknown> = {
      question,
      options,
    }
    if (typeof activeDate === "string") insertPayload.active_date = activeDate

    const { data: created, error: insertErr } = await supabase
      .from("sentimetre_questions")
      .insert(insertPayload)
      .select("id, question, options, active_date, created_at, updated_at")
      .single()

    if (insertErr || !created) {
      console.error("[admin/sentimetre POST] insert failed:", insertErr)
      return NextResponse.json({ error: "Failed to create question" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username || "unknown", "sentimetre.create", {
      question_id: created.id,
      scheduled: typeof activeDate === "string" ? activeDate : null,
      question_preview: question.slice(0, 60),
    })

    return NextResponse.json({ question: created })
  } catch (error) {
    console.error("[admin/sentimetre POST]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
