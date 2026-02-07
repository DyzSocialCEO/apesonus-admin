import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

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

    // If setting as featured, unfeatured all others first
    if (body.is_featured) {
      await supabase.from("tracks").update({ is_featured: false }).eq("is_featured", true)
    }

    const { data, error } = await supabase
      .from("tracks")
      .insert({
        title: body.title,
        artist: body.artist,
        mood: body.mood,
        cover: body.cover,
        audio: body.audio,
        duration: body.duration || 0,
        is_instrumental: body.is_instrumental || false,
        soundbath_category: body.soundbath_category || null,
        is_active: body.is_active !== false,
        is_featured: body.is_featured || false,
        is_editors_choice: body.is_editors_choice || false,
        sort_order: body.sort_order || 0,
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
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    const supabase = await createAdminClient()

    // If setting as featured, unfeatured all others first
    if (updates.is_featured) {
      await supabase.from("tracks").update({ is_featured: false }).eq("is_featured", true)
    }

    updates.updated_at = new Date().toISOString()

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

    const supabase = await createAdminClient()
    const { error } = await supabase.from("tracks").delete().eq("id", parseInt(id))

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting track:", error)
    return NextResponse.json({ error: "Failed to delete track" }, { status: 500 })
  }
}
