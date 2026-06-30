import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function badUrl(v: unknown): string | null {
  const s = String(v ?? "").trim()
  if (!s) return "required"
  try { const u = new URL(s); if (u.protocol !== "https:" && u.protocol !== "http:") return "must be http(s)" }
  catch { return "must be a full URL (https://…)" }
  return null
}

/** PATCH /api/admin/pods/[id] — edit details / toggle published. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = params.id
  const b = await request.json().catch(() => ({})) as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  if ("title" in b) { const t = String(b.title ?? "").trim(); if (!t) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 }); patch.title = t }
  if ("blurb" in b) patch.blurb = String(b.blurb ?? "").trim() || null
  if ("audio" in b) { const e = badUrl(b.audio); if (e) return NextResponse.json({ error: `Audio URL ${e}.` }, { status: 400 }); patch.audio = String(b.audio).trim() }
  if ("cover" in b) { const c = String(b.cover ?? "").trim(); if (c && badUrl(c)) return NextResponse.json({ error: "Cover must be a full URL." }, { status: 400 }); patch.cover = c || null }
  if ("duration_seconds" in b) {
    const dur = b.duration_seconds == null || b.duration_seconds === "" ? null : Math.max(0, Math.round(Number(b.duration_seconds)))
    if (dur !== null && !Number.isFinite(dur)) return NextResponse.json({ error: "Duration must be seconds." }, { status: 400 })
    patch.duration_seconds = dur
  }
  if ("is_published" in b) patch.is_published = !!b.is_published
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 })

  const supabase = await createAdminClient()
  const { error } = await supabase.from("pit_pods").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/pods/[id] */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = params.id
  const supabase = await createAdminClient()
  const { error } = await supabase.from("pit_pods").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
