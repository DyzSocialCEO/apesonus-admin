import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE WARD desk.
 *
 * GET   the ward row, the two dose counters, and the track list to pick from
 * PATCH the song on the ward, the mission target, and what admission costs
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

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [cfgRow, counts, tracks, admitted] = await Promise.all([
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
    ])

    const config = readConfig(cfgRow.data?.value)
    const c = (counts.data ?? {}) as { ward?: number }

    return NextResponse.json({
      config,
      wardDoses: Number(c.ward ?? 0),
      admittedNow: Number(admitted.count ?? 0),
      tracks: tracks.data ?? [],
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
