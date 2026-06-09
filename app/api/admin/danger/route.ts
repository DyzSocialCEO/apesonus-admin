import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ============================================================================
// /api/admin/danger — launch / list / resolve / void "save this track" events
//
//   create  -> inserts a live danger_events row (ends_at = now + duration)
//   resolve -> arena... danger_resolve RPC: saved if bar full, else purge->tombstone
//   void    -> cancels the event (burns already made stay burned, by design)
// ============================================================================

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()

    const { data: events } = await supabase
      .from("danger_events")
      .select("id, track_id, title, threshold, raised, starts_at, ends_at, status, resolved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100)

    // track details for the events
    const ids = Array.from(new Set((events || []).map((e) => e.track_id)))
    const trackById: Record<number, { title: string; artist: string }> = {}
    if (ids.length) {
      const { data: trs } = await supabase.from("tracks").select("id, title, artist").in("id", ids)
      for (const t of trs || []) trackById[t.id] = { title: t.title, artist: t.artist }
    }
    const eventsOut = (events || []).map((e) => ({
      ...e,
      track_title: trackById[e.track_id]?.title || ("#" + e.track_id),
      track_artist: trackById[e.track_id]?.artist || "",
    }))

    // active, non-tombstoned tracks for the picker
    const { data: tracks } = await supabase
      .from("tracks").select("id, title, artist, mood")
      .eq("is_active", true).eq("is_tombstoned", false).order("title")

    return NextResponse.json({ events: eventsOut, tracks: tracks || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()
    const body = await request.json()
    const action = body.action

    if (action === "create") {
      const { track_id, title, duration_seconds, threshold } = body
      if (!track_id) return NextResponse.json({ error: "pick a track to threaten" }, { status: 400 })
      if (!title || !String(title).trim()) return NextResponse.json({ error: "write a rally message" }, { status: 400 })
      const dur = Number(duration_seconds)
      const thr = Number(threshold)
      if (!dur || dur <= 0) return NextResponse.json({ error: "set a countdown" }, { status: 400 })
      if (!thr || thr <= 0) return NextResponse.json({ error: "set a rescue threshold" }, { status: 400 })

      const ends = new Date(Date.now() + dur * 1000)
      const { data, error } = await supabase.from("danger_events").insert({
        track_id: Number(track_id),
        title: String(title).trim(),
        threshold: thr,
        status: "live",
        ends_at: ends.toISOString(),
        created_by: null,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ created: true, event: data })
    }

    const eventId = body.event_id
    if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 })

    if (action === "resolve") {
      const { data, error } = await supabase.rpc("danger_resolve", { p_event_id: eventId })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ resolved: true, result: data })
    }

    if (action === "void") {
      const { error } = await supabase.from("danger_events").update({ status: "void", resolved_at: new Date().toISOString() }).eq("id", eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ voided: true })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
