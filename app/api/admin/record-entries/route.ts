import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/record-entries
 *
 * CRUD for record_entries — the songs that appear on The Record.
 * Each entry ties together:
 *   - zone            (coin_of_month | celebration | funeral)
 *   - project_name    (the subject — "PEPE", "LUNA", etc)
 *   - project_key     (lowercase normalized identifier, used for
 *                      30-day exclusivity and de-duping)
 *   - visiting_artist (who "performed" the song)
 *   - track           (the audio/cover asset from the tracks table)
 *   - commemorative_text (the line that appears on the entry card)
 *
 * Side-effect on create: flips the attached track's is_record_only=true
 * so it doesn't appear in the main /api/tracks feed. That's how Record
 * tracks stay out of the general catalog.
 *
 * Session-gated, rate-limited, audit-logged on writes.
 */

const KEY_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/
const VALID_ZONES = new Set(["coin_of_month", "celebration", "funeral"])

async function gate(request: Request) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const ip = getClientIp(request)
  const { success } = await adminGeneralRatelimit().limit(`record-entries:${ip}`)
  if (!success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) }
  return { session }
}

function shapeEntry(row: Record<string, unknown>) {
  return {
    id: row.id,
    zone: row.zone,
    projectName: row.project_name,
    projectKey: row.project_key,
    visitingArtistId: row.visiting_artist_id,
    trackId: row.track_id,
    commemorativeText: row.commemorative_text,
    coinOfMonthFor: row.coin_of_month_for,
    publishedAt: row.published_at,
    isActive: row.is_active,
  }
}

// ═════════════════════════════════════════════════════════════════
// GET
// ═════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error

  try {
    const supabase = await createAdminClient()
    const { data: entries, error } = await supabase
      .from("record_entries")
      .select(`
        id, zone, project_name, project_key,
        visiting_artist_id, track_id,
        commemorative_text, coin_of_month_for,
        published_at, is_active,
        visiting_artists!inner ( id, slug, name ),
        tracks!inner ( id, title, artist, cover )
      `)
      .order("published_at", { ascending: false })

    if (error) {
      console.error("record-entries list error", error)
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 })
    }

    return NextResponse.json({
      entries: (entries ?? []).map((e: Record<string, unknown>) => ({
        ...shapeEntry(e),
        visitingArtist: e.visiting_artists,
        track: e.tracks,
      })),
    })
  } catch (err) {
    console.error("record-entries GET error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// POST — create
// ═════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const zone = String(body.zone ?? "").trim()
    const projectName = String(body.projectName ?? "").trim()
    const projectKey = String(body.projectKey ?? "").trim().toLowerCase()
    const visitingArtistId = Number(body.visitingArtistId)
    const trackId = Number(body.trackId)
    const commemorativeText = String(body.commemorativeText ?? "").trim()
    const coinOfMonthFor = body.coinOfMonthFor ? String(body.coinOfMonthFor).trim() : null
    const isActive = body.isActive !== false

    if (!VALID_ZONES.has(zone)) {
      return NextResponse.json({ error: "Invalid zone" }, { status: 400 })
    }
    if (!projectName || projectName.length > 80) {
      return NextResponse.json({ error: "Project name required (1-80 chars)" }, { status: 400 })
    }
    if (!projectKey || !KEY_RX.test(projectKey) || projectKey.length > 40) {
      return NextResponse.json(
        { error: "Project key must be lowercase alphanumeric with - or _ (1-40 chars)" },
        { status: 400 }
      )
    }
    if (!Number.isInteger(visitingArtistId) || visitingArtistId < 1) {
      return NextResponse.json({ error: "visitingArtistId required" }, { status: 400 })
    }
    if (!Number.isInteger(trackId) || trackId < 1) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 })
    }
    if (!commemorativeText || commemorativeText.length < 10 || commemorativeText.length > 500) {
      return NextResponse.json(
        { error: "Commemorative text must be 10-500 characters" },
        { status: 400 }
      )
    }
    if (zone === "coin_of_month" && !coinOfMonthFor) {
      return NextResponse.json(
        { error: "coinOfMonthFor date required for Coin of the Month entries" },
        { status: 400 }
      )
    }
    if (coinOfMonthFor && !/^\d{4}-\d{2}-\d{2}$/.test(coinOfMonthFor)) {
      return NextResponse.json(
        { error: "coinOfMonthFor must be in YYYY-MM-DD format" },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Verify visiting_artist + track exist before inserting
    const [artistCheck, trackCheck] = await Promise.all([
      supabase.from("visiting_artists").select("id").eq("id", visitingArtistId).maybeSingle(),
      supabase.from("tracks").select("id, is_record_only").eq("id", trackId).maybeSingle(),
    ])

    if (!artistCheck.data) {
      return NextResponse.json({ error: "Visiting artist not found" }, { status: 404 })
    }
    if (!trackCheck.data) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 })
    }

    // Insert the entry
    const { data: created, error: insertErr } = await supabase
      .from("record_entries")
      .insert({
        zone,
        project_name: projectName,
        project_key: projectKey,
        visiting_artist_id: visitingArtistId,
        track_id: trackId,
        commemorative_text: commemorativeText,
        coin_of_month_for: zone === "coin_of_month" ? coinOfMonthFor : null,
        is_active: isActive,
      })
      .select()
      .single()

    if (insertErr || !created) {
      console.error("record-entries insert error", insertErr)
      return NextResponse.json({ error: "Failed to create entry" }, { status: 500 })
    }

    // Side-effect: flip attached track to is_record_only=true so it
    // doesn't appear in the main catalog. Only run if not already set.
    if (trackCheck.data.is_record_only !== true) {
      const { error: trackUpdateErr } = await supabase
        .from("tracks")
        .update({ is_record_only: true })
        .eq("id", trackId)
      if (trackUpdateErr) {
        console.error("track record-only flip error", trackUpdateErr)
        // Not fatal — entry is created. Log and continue.
      }
    }

    await logAdminAction(supabase, request, session.username, "record_entry.create", {
      id: created.id,
      zone,
      projectName,
      trackId,
      visitingArtistId,
    })

    return NextResponse.json({ entry: shapeEntry(created) })
  } catch (err) {
    console.error("record-entries POST error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// PATCH — update
// ═════════════════════════════════════════════════════════════════
export async function PATCH(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const id = Number(body.id)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if (body.zone !== undefined) {
      if (!VALID_ZONES.has(body.zone)) {
        return NextResponse.json({ error: "Invalid zone" }, { status: 400 })
      }
      updates.zone = body.zone
    }
    if (body.projectName !== undefined) {
      const v = String(body.projectName).trim()
      if (!v || v.length > 80) return NextResponse.json({ error: "Invalid project name" }, { status: 400 })
      updates.project_name = v
    }
    if (body.projectKey !== undefined) {
      const v = String(body.projectKey).trim().toLowerCase()
      if (!v || !KEY_RX.test(v) || v.length > 40) {
        return NextResponse.json({ error: "Invalid project key" }, { status: 400 })
      }
      updates.project_key = v
    }
    if (body.visitingArtistId !== undefined) {
      const v = Number(body.visitingArtistId)
      if (!Number.isInteger(v) || v < 1) return NextResponse.json({ error: "Invalid visitingArtistId" }, { status: 400 })
      updates.visiting_artist_id = v
    }
    if (body.trackId !== undefined) {
      const v = Number(body.trackId)
      if (!Number.isInteger(v) || v < 1) return NextResponse.json({ error: "Invalid trackId" }, { status: 400 })
      updates.track_id = v
    }
    if (body.commemorativeText !== undefined) {
      const v = String(body.commemorativeText).trim()
      if (v.length < 10 || v.length > 500) {
        return NextResponse.json({ error: "Commemorative text must be 10-500 chars" }, { status: 400 })
      }
      updates.commemorative_text = v
    }
    if (body.coinOfMonthFor !== undefined) {
      if (body.coinOfMonthFor === null || body.coinOfMonthFor === "") {
        updates.coin_of_month_for = null
      } else {
        const v = String(body.coinOfMonthFor).trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return NextResponse.json({ error: "coinOfMonthFor must be YYYY-MM-DD" }, { status: 400 })
        }
        updates.coin_of_month_for = v
      }
    }
    if (body.isActive !== undefined) {
      updates.is_active = Boolean(body.isActive)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // If track is changing, flip the new track to is_record_only=true
    if (updates.track_id) {
      await supabase
        .from("tracks")
        .update({ is_record_only: true })
        .eq("id", updates.track_id as number)
    }

    const { data: updated, error: updateErr } = await supabase
      .from("record_entries")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error("record-entry update error", updateErr)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "record_entry.update", {
      id, fields: Object.keys(updates),
    })

    return NextResponse.json({ entry: shapeEntry(updated) })
  } catch (err) {
    console.error("record-entries PATCH error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// DELETE
// ═════════════════════════════════════════════════════════════════
export async function DELETE(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  try {
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { error: deleteErr } = await supabase
      .from("record_entries")
      .delete()
      .eq("id", id)

    if (deleteErr) {
      console.error("record-entry delete error", deleteErr)
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "record_entry.delete", { id })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("record-entries DELETE error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
