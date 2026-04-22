import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/visiting-artists
 *
 * CRUD for visiting_artists — one-off characters per Record entry.
 * These are distinct from the 7 permanent artist roster (which lives
 * in code, not the DB). Each Record entry references exactly one
 * visiting artist via visiting_artist_id.
 *
 * Methods:
 *   GET     — list all, newest first
 *   POST    — create (body: { slug, name, bio, imageUrl? })
 *   PATCH   — update one (body: { id, slug?, name?, bio?, imageUrl? })
 *   DELETE  — remove one (body: { id })
 *
 * All write actions are session-gated, rate-limited, and audit-logged.
 */

// Slug validation: lowercase letters, numbers, hyphens only. 1-40 chars.
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function gate(request: Request) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const ip = getClientIp(request)
  const { success } = await adminGeneralRatelimit().limit(`visiting-artists:${ip}`)
  if (!success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) }

  return { session }
}

// ═════════════════════════════════════════════════════════════════
// GET
// ═════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("visiting_artists")
      .select("id, slug, name, bio, image_url, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("visiting_artists list error", error)
      return NextResponse.json({ error: "Failed to fetch visiting artists" }, { status: 500 })
    }

    // Also fetch entry counts per artist so admin sees which ones are in use
    const { data: entries } = await supabase
      .from("record_entries")
      .select("visiting_artist_id")
      .eq("is_active", true)

    const entryCounts = new Map<number, number>()
    for (const e of entries ?? []) {
      if (e.visiting_artist_id != null) {
        entryCounts.set(e.visiting_artist_id, (entryCounts.get(e.visiting_artist_id) ?? 0) + 1)
      }
    }

    return NextResponse.json({
      artists: (data ?? []).map(a => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        bio: a.bio,
        imageUrl: a.image_url,
        createdAt: a.created_at,
        entryCount: entryCounts.get(a.id) ?? 0,
      })),
    })
  } catch (err) {
    console.error("visiting_artists GET error", err)
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

    const slug = String(body.slug ?? "").trim().toLowerCase()
    const name = String(body.name ?? "").trim()
    const bio  = String(body.bio  ?? "").trim()
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null

    if (!slug || !SLUG_RX.test(slug) || slug.length > 40) {
      return NextResponse.json(
        { error: "Slug must be lowercase letters, numbers, and hyphens (1-40 chars)" },
        { status: 400 }
      )
    }
    if (!name || name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Name must be 2-80 characters" }, { status: 400 })
    }
    if (!bio || bio.length < 10 || bio.length > 400) {
      return NextResponse.json({ error: "Bio must be 10-400 characters" }, { status: 400 })
    }
    if (imageUrl && imageUrl.length > 500) {
      return NextResponse.json({ error: "Image URL too long (max 500 chars)" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Unique slug check
    const { data: existing } = await supabase
      .from("visiting_artists")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 })
    }

    const { data: created, error: insertErr } = await supabase
      .from("visiting_artists")
      .insert({ slug, name, bio, image_url: imageUrl })
      .select()
      .single()

    if (insertErr || !created) {
      console.error("visiting_artist insert error", insertErr)
      return NextResponse.json({ error: "Failed to create visiting artist" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "visiting_artist.create", {
      id: created.id, slug, name,
    })

    return NextResponse.json({
      artist: {
        id: created.id, slug: created.slug, name: created.name, bio: created.bio,
        imageUrl: created.image_url, createdAt: created.created_at, entryCount: 0,
      },
    })
  } catch (err) {
    console.error("visiting_artists POST error", err)
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

    if (body.slug !== undefined) {
      const slug = String(body.slug).trim().toLowerCase()
      if (!SLUG_RX.test(slug) || slug.length > 40) {
        return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
      }
      updates.slug = slug
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Name must be 2-80 characters" }, { status: 400 })
      }
      updates.name = name
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio).trim()
      if (bio.length < 10 || bio.length > 400) {
        return NextResponse.json({ error: "Bio must be 10-400 characters" }, { status: 400 })
      }
      updates.bio = bio
    }
    if (body.imageUrl !== undefined) {
      const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null
      if (imageUrl && imageUrl.length > 500) {
        return NextResponse.json({ error: "Image URL too long" }, { status: 400 })
      }
      updates.image_url = imageUrl
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // If slug is changing, ensure uniqueness
    if (updates.slug) {
      const { data: collision } = await supabase
        .from("visiting_artists")
        .select("id")
        .eq("slug", updates.slug as string)
        .neq("id", id)
        .maybeSingle()
      if (collision) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 })
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from("visiting_artists")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error("visiting_artist update error", updateErr)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "visiting_artist.update", {
      id, fields: Object.keys(updates),
    })

    return NextResponse.json({
      artist: {
        id: updated.id, slug: updated.slug, name: updated.name, bio: updated.bio,
        imageUrl: updated.image_url, createdAt: updated.created_at,
      },
    })
  } catch (err) {
    console.error("visiting_artists PATCH error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// DELETE — remove
//   Refuses if any record_entries reference this artist.
//   DB ON DELETE RESTRICT would catch this anyway, but we check up
//   front to return a friendly error instead of a cryptic 500.
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

    // Check for references
    const { count: refCount } = await supabase
      .from("record_entries")
      .select("id", { count: "exact", head: true })
      .eq("visiting_artist_id", id)

    if ((refCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${refCount} Record entries still reference this artist.` },
        { status: 409 }
      )
    }

    const { error: deleteErr } = await supabase
      .from("visiting_artists")
      .delete()
      .eq("id", id)

    if (deleteErr) {
      console.error("visiting_artist delete error", deleteErr)
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "visiting_artist.delete", { id })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("visiting_artists DELETE error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
