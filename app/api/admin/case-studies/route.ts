import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"

/**
 * CASE STUDIES.
 *
 * Clips live on Bunny. This only holds the URL, the title and the line, which
 * is the same shape as a track. Nothing is uploaded through here.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("ward_case_studies_desk")
    if (error) throw error
    return NextResponse.json({ clips: data ?? [] })
  } catch (e) {
    console.error("[admin/case-studies]", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const body = await request.json()

    if (body.what === "delete") {
      const id = Number(body.id)
      if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
      const { data, error } = await supabase.rpc("ward_case_study_delete", { p_id: id })
      if (error) throw error
      if (data?.ok !== true) return NextResponse.json({ error: "Not found." }, { status: 404 })
      await logAdminAction(supabase, request, session.username, "case.delete", { id })
      return NextResponse.json({ saved: true })
    }

    const url = String(body.url ?? "").trim()
    if (!url) {
      return NextResponse.json({ error: "Paste the Bunny URL for the clip." }, { status: 400 })
    }
    if (!/^https:\/\//i.test(url)) {
      return NextResponse.json({ error: "The URL has to start with https." }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("ward_case_study_save", {
      p_id: body.id == null ? null : Number(body.id),
      p_title: String(body.title ?? "").slice(0, 120),
      p_line: String(body.line ?? "").slice(0, 240),
      p_url: url,
      p_poster: String(body.poster ?? "").trim().slice(0, 500),
      p_seconds: Math.max(0, Math.floor(Number(body.seconds ?? 0)) || 0),
      p_sort: Math.max(0, Math.floor(Number(body.sort ?? 0)) || 0),
      p_live: body.live !== false,
    })
    if (error) throw error
    if (data?.ok !== true) {
      return NextResponse.json({ error: "Could not save that clip." }, { status: 400 })
    }

    await logAdminAction(supabase, request, session.username, "case.save", { id: data.id, url })
    return NextResponse.json({ saved: true, id: data.id })
  } catch (e) {
    console.error("[admin/case-studies] POST", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
