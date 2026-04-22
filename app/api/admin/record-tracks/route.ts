import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/record-tracks
 *
 * Lightweight read-only endpoint for the Record entry composer's
 * track picker. Returns every track in a minimal shape suitable for
 * a dropdown: id, title, artist, cover, is_record_only.
 *
 * Why a separate endpoint instead of reusing /api/admin/tracks?
 * 1. /api/admin/tracks returns every column including instrumental
 *    flags, soundbath_category, sort_order, play_count — we only need
 *    four fields in the composer. Smaller payload = faster picker.
 * 2. The composer wants entries sorted alphabetically by title for
 *    easier find-as-you-scan, not by sort_order.
 * 3. Keeps the existing tracks admin page untouched. Any changes to
 *    how record tracks are picked live in this route.
 *
 * Session-gated. Read-only — no audit log needed.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, artist, cover, is_record_only")
      .eq("is_active", true)
      .order("title", { ascending: true })

    if (error) {
      console.error("record-tracks list error", error)
      return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 })
    }

    return NextResponse.json({
      tracks: (data ?? []).map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        cover: t.cover,
        isRecordOnly: t.is_record_only === true,
      })),
    })
  } catch (err) {
    console.error("record-tracks GET error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
