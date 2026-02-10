import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

// GET - List all stories for admin review
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || "pending"

  try {
    let query = supabase
      .from("stories")
      .select("*, users!stories_telegram_id_fkey(username, first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(50)

    if (status !== "all") {
      query = query.eq("status", status)
    }

    const { data, error } = await query

    if (error) {
      // Fallback without join if FK doesn't exist
      const { data: stories, error: fallbackError } = await supabase
        .from("stories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(async (result) => {
          if (result.error) return result
          // Manually fetch user info
          const storiesWithUsers = await Promise.all(
            (result.data || []).map(async (story) => {
              const { data: userData } = await supabase
                .from("users")
                .select("username, first_name, last_name")
                .eq("telegram_id", story.telegram_id)
                .single()
              return { ...story, user: userData }
            })
          )
          return { data: storiesWithUsers, error: null }
        })

      if (fallbackError) throw fallbackError
      
      const filtered = status === "all" ? stories : (stories || []).filter((s: any) => s.status === status)
      return NextResponse.json({ stories: filtered || [] })
    }

    return NextResponse.json({ stories: data || [] })
  } catch (e: any) {
    return NextResponse.json({ stories: [], error: e.message }, { status: 500 })
  }
}

// PUT - Update story status (approve/reject/select)
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  try {
    const body = await request.json()
    const { id, status, adminNotes } = body

    if (!id || !status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 })
    }

    const validStatuses = ["pending", "approved", "rejected", "selected"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Get story first
    const { data: story } = await supabase
      .from("stories")
      .select("telegram_id, status as current_status, moji_earned")
      .eq("id", id)
      .single()

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 })
    }

    // Update story
    const updates: any = {
      status,
      
    }
    if (adminNotes !== undefined) updates.admin_notes = adminNotes

    // If selecting for track, award 500 Moji Points
    if (status === "selected" && story.current_status !== "selected") {
      updates.moji_earned = 500

      // Award moji points
      await supabase.from("moji_transactions").insert({
        telegram_id: story.telegram_id,
        amount: 500,
        reason: "story_selected",
      })

      // Update user's total
      await supabase.rpc("increment_moji_points", {
        user_telegram_id: story.telegram_id,
        points_to_add: 500,
      }).catch(async () => {
        const { data: u } = await supabase
          .from("users")
          .select("moji_points")
          .eq("telegram_id", story.telegram_id)
          .single()
        await supabase
          .from("users")
          .update({ moji_points: (u?.moji_points || 0) + 500 })
          .eq("telegram_id", story.telegram_id)
      })
    }

    const { error } = await supabase
      .from("stories")
      .update(updates)
      .eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE - Delete a story
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    const { error } = await supabase.from("stories").delete().eq("id", id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
