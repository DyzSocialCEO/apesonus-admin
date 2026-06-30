import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** A full http(s) URL — Bunny signing does new URL(audio), so a bare path breaks playback. */
function badUrl(v: unknown): string | null {
  const s = String(v ?? "").trim()
  if (!s) return "required"
  try { const u = new URL(s); if (u.protocol !== "https:" && u.protocol !== "http:") return "must be http(s)" }
  catch { return "must be a full URL (https://…)" }
  return null
}

/** GET /api/admin/pods — all episodes, newest first (published + drafts). */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from("pit_pods")
    .select("id, title, blurb, audio, cover, duration_seconds, is_published, published_at, created_at")
    .order("published_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ episodes: data ?? [] })
}

/** POST /api/admin/pods — create an episode. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const title = String(b.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 })

  const audioErr = badUrl(b.audio)
  if (audioErr) return NextResponse.json({ error: `Audio URL ${audioErr}.` }, { status: 400 })

  const cover = String(b.cover ?? "").trim()
  if (cover && badUrl(cover)) return NextResponse.json({ error: "Cover must be a full URL." }, { status: 400 })

  const dur = b.duration_seconds == null || b.duration_seconds === "" ? null : Math.max(0, Math.round(Number(b.duration_seconds)))
  if (dur !== null && !Number.isFinite(dur)) return NextResponse.json({ error: "Duration must be a number of seconds." }, { status: 400 })

  const supabase = await createAdminClient()
  const { data, error } = await supabase.from("pit_pods").insert({
    title,
    blurb: String(b.blurb ?? "").trim() || null,
    audio: String(b.audio).trim(),
    cover: cover || null,
    duration_seconds: dur,
    is_published: b.is_published === false ? false : true,
  }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
