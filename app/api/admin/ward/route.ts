import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE WARD desk.
 *
 * GET   the ward row, the two dose counters, the track list, today's clip and
 *       today's question with its running split
 * PATCH the song, the mission target, what admission costs, today's clip, and
 *       today's question
 *
 * Everything the app shows about the song, the target and the price is read
 * from here, so none of it is written into the player's code.
 */

interface WardConfig {
  track_id: number | null
  track_title: string
  mission_target: number
  admission_hours: number
  admission_usd_cents: number
}

const FALLBACK: WardConfig = {
  track_id: null,
  track_title: "100X",
  mission_target: 100000,
  admission_hours: 24,
  admission_usd_cents: 100,
}

function readConfig(raw: unknown): WardConfig {
  try {
    const v = JSON.parse(String(raw ?? "{}"))
    const id = Number(v.track_id)
    const target = Number(v.mission_target)
    const hours = Number(v.admission_hours)
    const cents = Number(v.admission_usd_cents)
    return {
      track_id: Number.isFinite(id) && id > 0 ? Math.floor(id) : null,
      track_title: String(v.track_title || FALLBACK.track_title),
      mission_target: Number.isFinite(target) && target > 0 ? Math.floor(target) : FALLBACK.mission_target,
      admission_hours: Number.isFinite(hours) && hours > 0 ? Math.floor(hours) : FALLBACK.admission_hours,
      admission_usd_cents: Number.isFinite(cents) && cents > 0 ? Math.floor(cents) : FALLBACK.admission_usd_cents,
    }
  } catch {
    return FALLBACK
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const day = today()
    const [cfgRow, counts, tracks, admitted, clip, check, votes] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "ward_config").maybeSingle(),
      supabase.rpc("ward_counts", { p_user: null }),
      supabase
        .from("tracks")
        .select("id, title, artist")
        .eq("is_active", true)
        .order("title", { ascending: true })
        .limit(500),
      supabase
        .from("pit_clinic_pass")
        .select("user_id", { count: "exact", head: true })
        .gt("expires_at", new Date().toISOString()),
      supabase.from("ward_morning_dose").select("url, caption").eq("day", day).maybeSingle(),
      supabase.from("ward_checks").select("question, option_a, option_b").eq("day", day).maybeSingle(),
      supabase.from("ward_check_votes").select("choice").eq("day", day).limit(20000),
    ])

    const config = readConfig(cfgRow.data?.value)
    const c = (counts.data ?? {}) as { ward?: number }

    const rows = (votes.data ?? []) as { choice: string }[]
    const votesA = rows.filter((r) => r.choice === "a").length
    const votesB = rows.filter((r) => r.choice === "b").length

    return NextResponse.json({
      config,
      wardDoses: Number(c.ward ?? 0),
      admittedNow: Number(admitted.count ?? 0),
      tracks: tracks.data ?? [],
      day,
      morningDose: clip.data ? { url: String(clip.data.url), caption: clip.data.caption ?? "" } : null,
      check: check.data
        ? {
            question: String(check.data.question),
            optionA: String(check.data.option_a),
            optionB: String(check.data.option_b),
          }
        : null,
      votesA,
      votesB,
    })
  } catch (e: any) {
    console.error("[admin/ward] GET failed:", e)
    return NextResponse.json({ error: "Could not read the ward." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings").select("value").eq("key", "ward_config").maybeSingle()
    const current = readConfig(row?.value)
    const next: WardConfig = { ...current }

    if ("track_id" in body) {
      const id = Number(body.track_id)
      next.track_id = Number.isFinite(id) && id > 0 ? Math.floor(id) : null
    }
    if ("track_title" in body) {
      const t = String(body.track_title || "").trim()
      if (t) next.track_title = t
    }
    for (const [key, min] of [
      ["mission_target", 1],
      ["admission_hours", 1],
      ["admission_usd_cents", 1],
    ] as const) {
      if (key in body) {
        const n = Number(body[key])
        if (!Number.isFinite(n) || n < min) {
          return NextResponse.json({ error: `${key} must be a number of at least ${min}.` }, { status: 400 })
        }
        ;(next as any)[key] = Math.floor(n)
      }
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "ward_config", value: JSON.stringify(next) }, { onConflict: "key" })
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "ward.update", { before: current, after: next })

    return NextResponse.json({ config: next, saved: true })
  } catch (e: any) {
    console.error("[admin/ward] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save the ward." }, { status: 500 })
  }
}

/**
 * POST — today's clip and today's question.
 *
 * Both are one row per day, so writing them again replaces the day rather than
 * queueing a second one. The question can be rewritten while the day is young;
 * votes already cast stay against the day, which is why the desk shows the
 * running split next to the form.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()
    const day = today()

    if (body.what === "clip") {
      const url = String(body.url || "").trim()
      const caption = String(body.caption || "").trim()
      if (!url) {
        const { error } = await supabase.from("ward_morning_dose").delete().eq("day", day)
        if (error) throw error
        await logAdminAction(supabase, request, session.username, "ward.clip", { day, cleared: true })
        return NextResponse.json({ saved: true, morningDose: null })
      }
      if (!/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: "The clip needs a full https link." }, { status: 400 })
      }
      const { error } = await supabase
        .from("ward_morning_dose")
        .upsert({ day, url, caption: caption || null, updated_at: new Date().toISOString() }, { onConflict: "day" })
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.clip", { day, url })
      return NextResponse.json({ saved: true, morningDose: { url, caption } })
    }

    if (body.what === "check") {
      const question = String(body.question || "").trim()
      const optionA = String(body.optionA || "").trim()
      const optionB = String(body.optionB || "").trim()
      if (!question) {
        const { error } = await supabase.from("ward_checks").delete().eq("day", day)
        if (error) throw error
        await logAdminAction(supabase, request, session.username, "ward.check", { day, cleared: true })
        return NextResponse.json({ saved: true, check: null })
      }
      if (!optionA || !optionB) {
        return NextResponse.json({ error: "Both answers are required." }, { status: 400 })
      }
      const { error } = await supabase
        .from("ward_checks")
        .upsert(
          { day, question, option_a: optionA, option_b: optionB, updated_at: new Date().toISOString() },
          { onConflict: "day" },
        )
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.check", { day, question })
      return NextResponse.json({ saved: true, check: { question, optionA, optionB } })
    }

    return NextResponse.json({ error: "Nothing to save." }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/ward] POST failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}
