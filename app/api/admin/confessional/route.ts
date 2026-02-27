import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") || "posts"
    const postId = searchParams.get("postId")

    if (action === "comments" && postId) {
      const { data: comments } = await supabase
        .from("confessional_comments")
        .select("id, content, display_name, is_anonymous, is_dr_rektstein, created_at")
        .eq("post_id", parseInt(postId))
        .order("created_at", { ascending: true })

      return NextResponse.json({ comments: comments || [] })
    }

    // Default: list posts
    const { data: posts } = await supabase
      .from("confessional_posts")
      .select("id, mood, content, display_name, is_anonymous, is_seed, is_dr_rektstein, reactions_count, comments_count, created_at")
      .order("created_at", { ascending: false })
      .limit(100)

    return NextResponse.json({ posts: posts || [] })
  } catch (error) {
    console.error("[Admin Confessional GET]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    // ── CREATE POST ──
    if (action === "create_post") {
      const { mood, content, asDrRektstein = false } = body

      const validMoods = ["moon", "rekt", "cope", "degen", "zen"]
      if (!validMoods.includes(mood)) {
        return NextResponse.json({ error: "Invalid mood" }, { status: 400 })
      }
      if (!content || !content.trim()) {
        return NextResponse.json({ error: "Content required" }, { status: 400 })
      }

      const userId = asDrRektstein ? "dr_rektstein" : "seed_confessional"

      // Ensure user exists
      await supabase.from("users").upsert({
        telegram_id: userId,
        first_name: asDrRektstein ? "DR REKTSTEIN" : "STOKMOJI",
        username: asDrRektstein ? "dr_rektstein" : "stokmoji_seed",
        is_premium: false,
      }, { onConflict: "telegram_id" })

      const { data: post, error } = await supabase
        .from("confessional_posts")
        .insert({
          telegram_id: userId,
          mood,
          content: content.trim(),
          is_anonymous: !asDrRektstein,
          is_seed: true,
          is_dr_rektstein: asDrRektstein,
          display_name: asDrRektstein ? "DR REKTSTEIN" : null,
        })
        .select("id, mood, content, created_at")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ post })
    }

    // ── CREATE COMMENT ──
    if (action === "create_comment") {
      const { postId, content, asDrRektstein = false } = body

      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 })
      if (!content || !content.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 })

      // Use random seed user IDs so comments look like different people
      const userId = asDrRektstein ? "dr_rektstein" : `seed_user_${Math.floor(Math.random() * 20) + 2}`

      await supabase.from("users").upsert({
        telegram_id: userId,
        first_name: asDrRektstein ? "DR REKTSTEIN" : "anon",
        username: asDrRektstein ? "dr_rektstein" : userId,
        is_premium: false,
      }, { onConflict: "telegram_id" })

      const { data: comment, error } = await supabase
        .from("confessional_comments")
        .insert({
          post_id: parseInt(postId),
          telegram_id: userId,
          content: content.trim(),
          display_name: asDrRektstein ? "DR REKTSTEIN" : null,
          is_anonymous: !asDrRektstein,
          is_dr_rektstein: asDrRektstein,
        })
        .select("id, content, is_dr_rektstein, created_at")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ comment })
    }

    // ── DELETE POST ──
    if (action === "delete_post") {
      const { postId } = body
      await supabase.from("confessional_comments").delete().eq("post_id", postId)
      await supabase.from("confessional_reactions").delete().eq("post_id", postId)
      await supabase.from("confessional_posts").delete().eq("id", postId)
      return NextResponse.json({ deleted: true })
    }

    // ── DELETE COMMENT ──
    if (action === "delete_comment") {
      const { commentId } = body
      await supabase.from("confessional_comments").delete().eq("id", commentId)
      return NextResponse.json({ deleted: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    console.error("[Admin Confessional POST]", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
