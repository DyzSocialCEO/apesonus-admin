import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin single story — read full (with cards), update, delete.
 *
 * GET    → story + ordered cards
 * PATCH  → update story fields and/or replace its full card list.
 *          Body: { story?: {...}, cards?: [{image_url, body_text}, ...] }
 *          When `cards` is present we replace the whole set (simplest
 *          reliable model for a reorderable editor).
 * DELETE → remove story (cards cascade)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const storyId = Number(id)
  const supabase = await createAdminClient()

  const { data: story } = await supabase
    .from("field_note_stories").select("*").eq("id", storyId).maybeSingle()
  if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: cards } = await supabase
    .from("field_note_cards")
    .select("id, position, image_url, body_text")
    .eq("story_id", storyId)
    .order("position", { ascending: true })

  return NextResponse.json({ story, cards: cards ?? [] })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const storyId = Number(id)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const supabase = await createAdminClient()

  if (body.story && typeof body.story === "object") {
    const st = body.story as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ("title" in st) patch.title = String(st.title ?? "").trim()
    if ("series_name" in st) patch.series_name = st.series_name ? String(st.series_name).trim() : null
    if ("episode_number" in st) patch.episode_number = st.episode_number ? Number(st.episode_number) : null
    if ("excerpt" in st) patch.excerpt = st.excerpt ? String(st.excerpt).trim() : null
    if ("cover_image_url" in st) patch.cover_image_url = st.cover_image_url ? String(st.cover_image_url).trim() : null
    if ("status" in st) {
      const next = String(st.status)
      if (next !== "draft" && next !== "published") {
        return NextResponse.json({ error: "Bad status" }, { status: 400 })
      }
      patch.status = next
      if (next === "published") patch.published_at = new Date().toISOString()
    }
    const { error } = await supabase.from("field_note_stories").update(patch).eq("id", storyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(body.cards)) {
    // Replace the whole card set in order.
    await supabase.from("field_note_cards").delete().eq("story_id", storyId)
    const rows = (body.cards as Array<Record<string, unknown>>).map((c, i) => ({
      story_id: storyId,
      position: i,
      image_url: c.image_url ? String(c.image_url).trim() : null,
      body_text: c.body_text ? String(c.body_text) : null,
    }))
    if (rows.length) {
      const { error } = await supabase.from("field_note_cards").insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const supabase = await createAdminClient()
  const { error } = await supabase.from("field_note_stories").delete().eq("id", Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
