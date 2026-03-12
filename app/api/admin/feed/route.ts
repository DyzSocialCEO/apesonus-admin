import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data: posts, error } = await supabase
      .from("artist_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error
    return NextResponse.json({ posts: posts || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    if (action === "create") {
      const { artistId, content, postType } = body
      if (!artistId || !content || !postType) {
        return NextResponse.json({ error: "artistId, content, postType required" }, { status: 400 })
      }

      const { data, error } = await supabase
        .from("artist_posts")
        .insert({
          artist_id: artistId,
          content,
          post_type: postType,
          post_date: new Date().toISOString().split("T")[0],
          is_published: true,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, post: data })
    }

    if (action === "delete") {
      const { postId } = body
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 })

      const { error } = await supabase.from("artist_posts").delete().eq("id", postId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === "toggle") {
      const { postId, published } = body
      const { error } = await supabase
        .from("artist_posts")
        .update({ is_published: published })
        .eq("id", postId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
