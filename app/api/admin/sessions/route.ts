import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { readSessionConfig, sessionNum as num, type SessionConfig } from "@/lib/session-config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE SESSIONS desk, settings half.
 *
 * GET   the four numbers the private session runs on
 * PATCH any of them, one field or all four
 *
 * Nothing here is written into the app. The price the buyer is charged, the
 * number of cases a day, the countdown in the waiting room and whether the
 * door is open at all are read from this row, so changing any of them is a
 * save rather than a deploy.
 *
 * The switch is sent on its own the moment it is pressed. A toggle that waits
 * behind a Save button reads as broken, and this one closes the door.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "session_config")
      .maybeSingle()

    return NextResponse.json({
      config: readSessionConfig(data?.value),
      // Told plainly rather than assumed: the row has to exist before the desk
      // can save anything, and it is created by hand in the SQL editor.
      present: data != null,
    })
  } catch (e) {
    console.error("[admin/sessions] GET failed:", e)
    return NextResponse.json({ error: "Could not read the session settings." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "session_config")
      .maybeSingle()

    if (row == null) {
      return NextResponse.json(
        { error: "The session_config row does not exist yet. Run 116_session_settings.sql first." },
        { status: 409 },
      )
    }

    const current = readSessionConfig(row.value)
    const next: SessionConfig = { ...current }

    if ("price_cents" in body) next.price_cents = num(body.price_cents, current.price_cents, 1, 100000)
    if ("capacity_per_day" in body) next.capacity_per_day = num(body.capacity_per_day, current.capacity_per_day, 0, 1000)
    if ("per_patient_per_day" in body) next.per_patient_per_day = num(body.per_patient_per_day, current.per_patient_per_day, 1, 50)
    if ("estimate_minutes" in body) next.estimate_minutes = num(body.estimate_minutes, current.estimate_minutes, 1, 10080)
    if ("booking_open" in body) next.booking_open = body.booking_open === true

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "session_config", value: JSON.stringify(next) }, { onConflict: "key" })
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "sessions.settings", {
      before: current,
      after: next,
    })

    return NextResponse.json({ config: next, saved: true })
  } catch (e) {
    console.error("[admin/sessions] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save the session settings." }, { status: 500 })
  }
}
