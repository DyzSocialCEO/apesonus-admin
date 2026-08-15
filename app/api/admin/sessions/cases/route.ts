import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE SESSIONS desk, the queue.
 *
 * GET  the cases, newest first, filtered by what they are waiting on
 * POST one action at a time, named in `what`: stage, release, flag, extend,
 *      refund
 *
 * A case only ever moves from here. Nothing in the app advances a stage, so
 * the countdown a patient is watching is always a promise a person made.
 *
 * Refund is manual and exists for one reason: a case the clinic cannot
 * deliver. It is never automatic and nothing in the app can trigger it.
 */

const STAGES = ["received", "examining", "writing", "production", "ready"]
const STATUS_FOR_STAGE: Record<string, string> = {
  received: "open",
  examining: "open",
  writing: "writing",
  production: "production",
  ready: "ready",
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const filter = String(searchParams.get("filter") || "live")

    const supabase = await createAdminClient()

    let q = supabase
      .from("ward_cases")
      .select(
        "id, user_id, patient_no, therapist_id, condition, story, language, status, stage, price_cents, estimate_minutes, due_at, title, track_id, flagged, flag_reason, created_at, paid_at, released_at, refunded_at",
      )
      .order("created_at", { ascending: false })
      .limit(200)

    if (filter === "live") q = q.in("status", ["open", "writing", "production", "ready"])
    else if (filter === "flagged") q = q.eq("flagged", true)
    else if (filter === "released") q = q.eq("status", "released")
    else if (filter === "unpaid") q = q.eq("status", "awaiting_payment")

    const [{ data: rows }, { data: staff }, { data: counts }] = await Promise.all([
      q,
      supabase.from("ward_therapists").select("id, name").eq("active", true),
      supabase.from("ward_cases").select("status").in("status", ["open", "writing", "production", "ready"]),
    ])

    const names = new Map<number, string>((staff ?? []).map((t: any) => [Number(t.id), String(t.name || "")]))

    return NextResponse.json({
      cases: (rows ?? []).map((r: any) => ({
        ...r,
        therapist_name: names.get(Number(r.therapist_id)) ?? `#${r.therapist_id}`,
      })),
      staff: (staff ?? []).map((t: any) => ({ id: Number(t.id), name: String(t.name || "") })),
      liveCount: (counts ?? []).length,
    })
  } catch (e) {
    console.error("[admin/sessions/cases] GET failed:", e)
    return NextResponse.json({ error: "Could not read the queue." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const what = String(body?.what || "")
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "Which case?" }, { status: 400 })

    const supabase = await createAdminClient()
    const { data: row } = await supabase
      .from("ward_cases")
      .select("id, status, stage, title, track_id, estimate_minutes, due_at, ready_at")
      .eq("id", id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: "No such case." }, { status: 404 })

    if (row.status === "awaiting_payment") {
      return NextResponse.json({ error: "That case has not been paid for." }, { status: 409 })
    }

    /* Move it along the five stages the patient is watching. */
    if (what === "stage") {
      const stage = String(body?.stage || "")
      if (!STAGES.includes(stage)) return NextResponse.json({ error: "Unknown stage." }, { status: 400 })
      const { error } = await supabase
        .from("ward_cases")
        .update({
          stage,
          status: STATUS_FOR_STAGE[stage],
          ready_at: stage === "ready" ? (row.ready_at ?? new Date().toISOString()) : null,
        })
        .eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.stage", { id, stage })
      return NextResponse.json({ saved: true })
    }

    /* Hand it over. The song has to exist in Tracks first, the same as every
       other song in the building, so nothing here invents a second upload. */
    if (what === "release") {
      const trackId = Math.floor(Number(body?.track_id))
      const title = String(body?.title || "").trim()
      if (!Number.isFinite(trackId) || trackId < 1) {
        return NextResponse.json({ error: "Attach a track first." }, { status: 400 })
      }
      if (!title) return NextResponse.json({ error: "Give it a title." }, { status: 400 })

      const { data: track } = await supabase
        .from("tracks")
        .select("id, audio, cover")
        .eq("id", trackId)
        .maybeSingle()
      if (!track?.audio || !track?.cover) {
        return NextResponse.json({ error: "That track has no audio or no cover." }, { status: 400 })
      }

      const { error } = await supabase
        .from("ward_cases")
        .update({
          track_id: trackId,
          title,
          status: "released",
          stage: "ready",
          ready_at: row.ready_at ?? new Date().toISOString(),
          released_at: new Date().toISOString(),
        })
        .eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.release", { id, trackId, title })
      return NextResponse.json({ saved: true })
    }

    /* Attach without releasing, so a case can be prepared and handed over
       later without the patient seeing a half finished thing. */
    if (what === "attach") {
      const trackId = Math.floor(Number(body?.track_id))
      const title = String(body?.title || "").trim()
      const patch: Record<string, unknown> = {}
      if (Number.isFinite(trackId) && trackId > 0) patch.track_id = trackId
      if (title) patch.title = title
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "Nothing to attach." }, { status: 400 })
      }
      const { error } = await supabase.from("ward_cases").update(patch).eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.attach", { id, ...patch })
      return NextResponse.json({ saved: true })
    }

    /* A case that stops before production. It generates nothing and gets a
       plain answer from a person. */
    if (what === "flag") {
      const on = body?.on !== false
      const reason = String(body?.reason || "").trim()
      const { error } = await supabase
        .from("ward_cases")
        .update({ flagged: on, flag_reason: on ? reason || "flagged by hand" : null })
        .eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.flag", { id, on, reason })
      return NextResponse.json({ saved: true })
    }

    /* More time on the clock for this one case. The patient sees the new
       number rather than a countdown that already ran out. */
    if (what === "extend") {
      const mins = Math.floor(Number(body?.minutes))
      if (!Number.isFinite(mins) || mins < 1 || mins > 10080) {
        return NextResponse.json({ error: "How many minutes?" }, { status: 400 })
      }
      const from = row.due_at ? new Date(row.due_at).getTime() : Date.now()
      const base = Math.max(from, Date.now())
      const { error } = await supabase
        .from("ward_cases")
        .update({ due_at: new Date(base + mins * 60000).toISOString() })
        .eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.extend", { id, mins })
      return NextResponse.json({ saved: true })
    }

    /* By hand, for a case the clinic cannot deliver. The money is sent back
       outside the app; this records that the case is closed and why. */
    if (what === "refund") {
      const reason = String(body?.reason || "").trim()
      if (!reason) return NextResponse.json({ error: "Say why. It goes in the log." }, { status: 400 })
      const { error } = await supabase
        .from("ward_cases")
        .update({ status: "refunded", refunded_at: new Date().toISOString(), flag_reason: reason })
        .eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "sessions.refund", { id, reason })
      return NextResponse.json({ saved: true })
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 })
  } catch (e) {
    console.error("[admin/sessions/cases] POST failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}
