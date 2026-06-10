import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CONFIG_KEY = "pit_config"

/**
 * GET /api/admin/ammo/daily-track
 *
 * The current featured free-play track plus the catalog list to pick from.
 * The free daily play (one per UTC day) only applies on the featured track.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: cfgRow } = await supabase
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()

    let featuredId: number | null = null
    try {
      const cfg = cfgRow?.value ? JSON.parse(cfgRow.value) : {}
      featuredId = cfg.featured_track_id != null ? Number(cfg.featured_track_id) : null
    } catch {}

    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, artist")
      .order("title", { ascending: true })

    let featured: any = null
    if (featuredId != null) {
      featured = (tracks || []).find(t => Number(t.id) === featuredId) || { id: featuredId }
    }

    return NextResponse.json({ featuredId, featured, tracks: tracks || [] })
  } catch (error) {
    console.error("[admin/ammo/daily-track] GET error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

/**
 * POST /api/admin/ammo/daily-track  { trackId }
 *
 * Sets featured_track_id in pit_config. Pass trackId null to clear it
 * (no free daily play available until one is set). Read-modify-write on
 * the JSON-in-TEXT config row; admin config writes are single-actor.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { trackId } = await request.json()
    const supabase = await createAdminClient()

    let newId: number | null = null
    if (trackId != null) {
      const parsed = parseInt(trackId)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "trackId must be a positive integer or null" }, { status: 400 })
      }
      const { data: track } = await supabase
        .from("tracks").select("id").eq("id", parsed).maybeSingle()
      if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })
      newId = parsed
    }

    const { data: cfgRow } = await supabase
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    if (!cfgRow?.value) {
      return NextResponse.json({ error: "pit_config missing — run pit_000_foundations first" }, { status: 500 })
    }

    let cfg: Record<string, unknown>
    try {
      cfg = JSON.parse(cfgRow.value)
    } catch {
      return NextResponse.json({ error: "pit_config is not valid JSON" }, { status: 500 })
    }

    const before = cfg.featured_track_id ?? null
    cfg.featured_track_id = newId

    const { error: updErr } = await supabase
      .from("app_settings")
      .update({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() })
      .eq("key", CONFIG_KEY)

    if (updErr) {
      console.error("[admin/ammo/daily-track] update failed:", updErr)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username || "unknown", "ammo.daily_track.set", {
      before,
      after: newId,
    })

    return NextResponse.json({ success: true, featuredId: newId })
  } catch (error) {
    console.error("[admin/ammo/daily-track] POST error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
