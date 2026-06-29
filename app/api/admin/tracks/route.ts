import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { detectDurationServer } from "@/lib/duration-detect"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ── Routes ──

// GET all tracks
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data: tracks, error } = await supabase
      .from("tracks")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) throw error
    return NextResponse.json({ tracks: tracks || [] })
  } catch (error) {
    console.error("Error fetching tracks:", error)
    return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 })
  }
}

// POST - create new track
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const supabase = await createAdminClient()

    // Auto-detect duration if not provided
    let duration = body.duration || 0
    if (duration === 0 && body.audio) {
      duration = (await detectDurationServer(body.audio)).duration
    }

    const { data, error } = await supabase
      .from("tracks")
      .insert({
        title: body.title,
        artist: body.artist,
        mood: body.mood,
        cover: body.cover,
        audio: body.audio,
        duration,
        is_instrumental: body.is_instrumental || false,
        soundbath_category: body.soundbath_category || null,
        is_active: body.is_active !== false,
        is_featured: body.is_featured || false,
        is_editors_choice: body.is_editors_choice || false,
        sort_order: body.sort_order || 0,
        is_record_only: body.is_record_only === true,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ track: data })
  } catch (error) {
    console.error("Error creating track:", error)
    return NextResponse.json({ error: "Failed to create track" }, { status: 500 })
  }
}

// PUT - update track
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    const { id } = body as { id?: number }
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    // Explicit field allowlist. Never spread the request body into .update() —
    // a stolen admin session could otherwise set arbitrary columns including
    // play_count (inflate/zero leaderboards) or repoint audio URLs.
    // play_count, created_at, and id are intentionally excluded. If any of
    // those ever need manual adjustment, use the Supabase table editor.
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    const b = body as Record<string, any>
    if (b.title !== undefined)              updates.title = b.title
    if (b.artist !== undefined)             updates.artist = b.artist
    if (b.mood !== undefined)               updates.mood = b.mood
    if (b.cover !== undefined)              updates.cover = b.cover
    if (b.audio !== undefined)              updates.audio = b.audio
    if (b.duration !== undefined)           updates.duration = b.duration
    if (b.is_instrumental !== undefined)    updates.is_instrumental = Boolean(b.is_instrumental)
    if (b.soundbath_category !== undefined) updates.soundbath_category = b.soundbath_category
    if (b.is_active !== undefined)          updates.is_active = Boolean(b.is_active)
    if (b.is_featured !== undefined)        updates.is_featured = Boolean(b.is_featured)
    if (b.is_editors_choice !== undefined)  updates.is_editors_choice = Boolean(b.is_editors_choice)
    if (b.sort_order !== undefined)         updates.sort_order = b.sort_order
    if (b.is_record_only !== undefined)     updates.is_record_only = Boolean(b.is_record_only)

    if (updates.audio && (!updates.duration || updates.duration === 0)) {
      updates.duration = (await detectDurationServer(updates.audio)).duration
    }

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("tracks")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ track: data })
  } catch (error) {
    console.error("Error updating track:", error)
    return NextResponse.json({ error: "Failed to update track" }, { status: 500 })
  }
}

// DELETE - remove track
export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    const trackId = parseInt(id)
    const supabase = await createAdminClient()

    // Clean up FK references before deleting track
    await supabase.from("favorites").delete().eq("track_id", trackId)
    await supabase.from("play_history").delete().eq("track_id", trackId)
    await supabase.from("unique_listens").delete().eq("track_id", trackId)

    const { error } = await supabase.from("tracks").delete().eq("id", trackId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete track" }, { status: 500 })
  }
}
