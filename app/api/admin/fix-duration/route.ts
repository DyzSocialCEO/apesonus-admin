import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { detectDurationServer } from "@/lib/duration-detect"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/fix-duration   { trackId }   (or { all: true })
 *
 * Detects audio duration SERVER-SIDE (reliable for every upload —
 * no browser <audio> element, which is what kept failing with
 * SRC_NOT_SUPPORTED) and writes it to the DB. Works for any track,
 * every time, including freshly uploaded / replaced ones.
 *
 *  { trackId: 123 }  -> fix that one track
 *  { all: true }     -> fix every track whose duration is 0 / null
 *
 * Returns per-track results so the admin can show exactly what
 * happened (fixed with the value, or failed with the real reason).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { trackId?: number; all?: boolean; audioUrl?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  // Detect-only mode: caller passes a raw audioUrl (e.g. the edit
  // modal, where the track may not be saved yet). No DB write — just
  // return the detected duration so the form can show it.
  if (body.audioUrl && !body.trackId && !body.all) {
    const { duration, reason } = await detectDurationServer(body.audioUrl)
    if (duration > 0) return NextResponse.json({ ok: true, duration })
    return NextResponse.json({ ok: false, duration: 0, reason: reason || "could not detect" })
  }

  const supabase = await createAdminClient()

  // Build the work list.
  let targets: Array<{ id: number; title: string; audio: string | null }> = []
  if (body.all) {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, audio")
      .or("duration.eq.0,duration.is.null")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    targets = (data ?? []) as typeof targets
  } else if (typeof body.trackId === "number") {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, audio")
      .eq("id", body.trackId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Track not found" }, { status: 404 })
    targets = [data as { id: number; title: string; audio: string | null }]
  } else {
    return NextResponse.json({ error: "Provide trackId or all:true" }, { status: 400 })
  }

  const results: Array<{ id: number; title: string; ok: boolean; duration?: number; reason?: string }> = []
  let fixed = 0
  let failed = 0

  for (const t of targets) {
    if (!t.audio) {
      failed++
      results.push({ id: t.id, title: t.title, ok: false, reason: "no audio URL stored on track" })
      continue
    }
    const { duration, reason } = await detectDurationServer(t.audio)
    if (duration > 0) {
      const { error } = await supabase
        .from("tracks")
        .update({ duration })
        .eq("id", t.id)
      if (error) {
        failed++
        results.push({ id: t.id, title: t.title, ok: false, reason: `DB save failed: ${error.message}` })
      } else {
        fixed++
        results.push({ id: t.id, title: t.title, ok: true, duration })
      }
    } else {
      failed++
      results.push({ id: t.id, title: t.title, ok: false, reason: reason || "could not detect duration" })
    }
  }

  return NextResponse.json({ ok: true, fixed, failed, total: targets.length, results })
}
