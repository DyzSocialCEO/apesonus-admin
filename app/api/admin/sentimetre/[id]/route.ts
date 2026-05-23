import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/sentimetre/[id]
 *
 * PATCH  — edit text/options, change schedule, or unschedule.
 *           body: { question?, options?[4], active_date? (string | null) }
 *           IMPORTANT: text/options edits are REFUSED once the question has
 *           any responses against it. Bossgee locked this rule — once a
 *           question has been answered, the text is final. Schedule date
 *           can still change for an unvoted question.
 *
 * DELETE — hard delete. Refused if there are any responses against the
 *           question (data integrity — aggregates would orphan).
 */

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

async function getResponseCount(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  questionId: string,
): Promise<number> {
  const { count } = await supabase
    .from("sentimetre_responses")
    .select("*", { count: "exact", head: true })
    .eq("question_id", questionId)
  return count || 0
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`admin-sentimetre:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const id = params.id
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const body = await request.json().catch(() => null) as
      | { question?: unknown; options?: unknown; active_date?: unknown }
      | null
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

    const supabase = await createAdminClient()

    // Load current state
    const { data: current, error: currentErr } = await supabase
      .from("sentimetre_questions")
      .select("id, question, options, active_date")
      .eq("id", id)
      .maybeSingle()
    if (currentErr || !current) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 })
    }

    const wantsTextEdit = body.question !== undefined
    const wantsOptionsEdit = body.options !== undefined
    const wantsScheduleChange = body.active_date !== undefined

    // ── Edit-lock rule: text/options edits blocked once responses exist
    if (wantsTextEdit || wantsOptionsEdit) {
      const responseCount = await getResponseCount(supabase, id)
      if (responseCount > 0) {
        return NextResponse.json(
          {
            error: "This question has already received responses. Text and options are now locked. You can still unschedule it or delete it once responses are cleared.",
          },
          { status: 409 },
        )
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (wantsTextEdit) {
      const q = typeof body.question === "string" ? body.question.trim() : ""
      if (q.length < 1 || q.length > 280) {
        return NextResponse.json({ error: "Question must be 1–280 characters" }, { status: 400 })
      }
      update.question = q
    }

    if (wantsOptionsEdit) {
      const raw = body.options
      if (!Array.isArray(raw) || raw.length !== 4) {
        return NextResponse.json({ error: "Exactly 4 options required" }, { status: 400 })
      }
      const options: string[] = []
      for (const o of raw) {
        if (typeof o !== "string" || !o.trim()) {
          return NextResponse.json({ error: "Each option must be a non-empty string" }, { status: 400 })
        }
        const trimmed = o.trim()
        if (trimmed.length > 200) {
          return NextResponse.json({ error: "Each option must be 1–200 characters" }, { status: 400 })
        }
        options.push(trimmed)
      }
      update.options = options
    }

    if (wantsScheduleChange) {
      const newDate = body.active_date
      if (newDate === null) {
        // Unschedule — move back to the bank
        update.active_date = null
      } else if (isValidDate(newDate)) {
        // Conflict check on the new date, unless we're keeping the same date
        if (newDate !== current.active_date) {
          const { data: collision } = await supabase
            .from("sentimetre_questions")
            .select("id")
            .eq("active_date", newDate)
            .neq("id", id)
            .maybeSingle()
          if (collision) {
            return NextResponse.json(
              { error: `A different question is already scheduled for ${newDate}. Unschedule it first or pick another date.` },
              { status: 409 },
            )
          }
        }
        update.active_date = newDate
      } else {
        return NextResponse.json({ error: "active_date must be YYYY-MM-DD or null" }, { status: 400 })
      }
    }

    if (Object.keys(update).length === 1) {
      // Only updated_at — caller sent nothing meaningful
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data: updated, error: updateErr } = await supabase
      .from("sentimetre_questions")
      .update(update)
      .eq("id", id)
      .select("id, question, options, active_date, created_at, updated_at")
      .single()

    if (updateErr || !updated) {
      console.error("[admin/sentimetre PATCH] update failed:", updateErr)
      return NextResponse.json({ error: "Failed to update question" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username || "unknown", "sentimetre.update", {
      question_id: id,
      changed_text: wantsTextEdit,
      changed_options: wantsOptionsEdit,
      changed_schedule: wantsScheduleChange,
      new_date: wantsScheduleChange ? (update.active_date as string | null) : null,
    })

    return NextResponse.json({ question: updated })
  } catch (error) {
    console.error("[admin/sentimetre PATCH]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`admin-sentimetre:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const id = params.id
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Refuse if any responses exist — aggregates would orphan
    const responseCount = await getResponseCount(supabase, id)
    if (responseCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete a question that has responses against it." },
        { status: 409 },
      )
    }

    const { error: deleteErr } = await supabase
      .from("sentimetre_questions")
      .delete()
      .eq("id", id)

    if (deleteErr) {
      console.error("[admin/sentimetre DELETE] delete failed:", deleteErr)
      return NextResponse.json({ error: "Failed to delete question" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username || "unknown", "sentimetre.delete", {
      question_id: id,
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("[admin/sentimetre DELETE]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
