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
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) throw error

    const enriched = await Promise.all(
      (stories || []).map(async (story) => {
        const { data: userData } = await supabase
          .from("users")
          .select("username, first_name, last_name")
          .eq("telegram_id", story.telegram_id)
          .single()
        return { ...story, user: userData }
      })
    )

    const filtered = status === "all" ? enriched : enriched.filter((s) => s.status === status)
    return NextResponse.json({ stories: filtered })
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

    const { data: story } = await supabase
      .from("stories")
      .select("telegram_id, status, moji_earned")
      .eq("id", id)
      .single()

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 })
    }

    const updates: any = { status }
    if (adminNotes !== undefined) updates.admin_notes = adminNotes

    if (status === "selected" && story.status !== "selected") {
      updates.moji_earned = 500
      await supabase.from("moji_transactions").insert({
        telegram_id: story.telegram_id,
        amount: 500,
        reason: "story_selected",
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
