import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin Field Notes — list + create.
 *
 * GET  → all stories (any status) newest first, with card counts
 * POST → create a new draft story { title, series_name?, episode_number?,
 *        excerpt?, cover_image_url? }
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from("field_note_stories")
    .select("id, title, series_name, episode_number, excerpt, cover_image_url, status, published_at, created_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (data ?? []).map((s: { id: number }) => s.id)
  const counts: Record<number, number> = {}
  if (ids.length) {
    const { data: cards } = await supabase
      .from("field_note_cards").select("story_id").in("story_id", ids)
    for (const c of cards ?? []) counts[c.story_id] = (counts[c.story_id] ?? 0) + 1
  }

  return NextResponse.json({
    stories: (data ?? []).map((s: { id: number }) => ({ ...s, card_count: counts[s.id] ?? 0 })),
  })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const title = String(body.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 })

  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from("field_note_stories")
    .insert({
      title,
      series_name: body.series_name ? String(body.series_name).trim() : null,
      episode_number: body.episode_number ? Number(body.episode_number) : null,
      excerpt: body.excerpt ? String(body.excerpt).trim() : null,
      cover_image_url: body.cover_image_url ? String(body.cover_image_url).trim() : null,
      status: "draft",
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
