import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/records
 *
 * THE CASE FILES THE CLINIC WRITES ITSELF.
 *
 * A case file needs two things a person has to decide: which track it belongs
 * to, and what the file says. Everything else is worked out in the database:
 * the therapist off the track, the condition off the track, and the patient
 * number drawn at random from the same range real patients use.
 *
 * THAT NUMBER IS THEN BURNED FOREVER. No human is ever given it, and deleting
 * the case does not release it, because a number that came back around would
 * put a stranger's face on a case file people have already read.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("ward_records_desk")
    if (error) throw error
    return NextResponse.json(data ?? { filed: [], available: [] })
  } catch (error) {
    console.error("[admin/records] GET failed:", error)
    return NextResponse.json({ error: "Could not read the records desk." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const what = String(body?.what || "")
    const supabase = await createAdminClient()

    if (what === "file") {
      const track = Math.floor(Number(body?.trackId))
      const note = String(body?.note ?? "").trim()
      if (!Number.isFinite(track) || track < 1) {
        return NextResponse.json({ error: "Pick a track." }, { status: 400 })
      }
      if (!note) return NextResponse.json({ error: "Write the case file first." }, { status: 400 })

      const { data, error } = await supabase.rpc("ward_clinic_record", { p_track: track, p_note: note })
      if (error) throw error
      // The database's own word for a refusal, never a swallowed 400.
      if (data?.ok !== true) {
        return NextResponse.json({ error: String(data?.reason || "Could not file that.") }, { status: 400 })
      }

      await logAdminAction(supabase, request, session.username, "records.file", {
        track,
        patientNo: data?.patientNo,
      })
      return NextResponse.json({ saved: true, patientNo: data?.patientNo })
    }

    if (what === "edit") {
      const id = String(body?.caseId || "").trim()
      const note = String(body?.note ?? "").trim()
      if (!id) return NextResponse.json({ error: "Which case file?" }, { status: 400 })
      if (!note) return NextResponse.json({ error: "A case file cannot say nothing." }, { status: 400 })

      const { data, error } = await supabase.rpc("ward_clinic_record_edit", { p_case: id, p_note: note })
      if (error) throw error
      if (data?.ok !== true) {
        return NextResponse.json({ error: String(data?.reason || "Could not change that.") }, { status: 400 })
      }

      await logAdminAction(supabase, request, session.username, "records.edit", { case: id })
      return NextResponse.json({ saved: true })
    }

    if (what === "remove") {
      const id = String(body?.caseId || "").trim()
      if (!id) return NextResponse.json({ error: "Which case file?" }, { status: 400 })

      const { data, error } = await supabase.rpc("ward_clinic_record_remove", { p_case: id })
      if (error) throw error
      if (data?.ok !== true) {
        return NextResponse.json({ error: String(data?.reason || "Could not remove that.") }, { status: 400 })
      }

      await logAdminAction(supabase, request, session.username, "records.remove", { case: id })
      return NextResponse.json({ saved: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    console.error("[admin/records] POST failed:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
