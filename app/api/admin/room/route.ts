import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE WAITING ROOM desk.
 *
 * GET   every confession, hidden ones included, newest first
 * PATCH hide or show one, or pin it as SEEN BY DR. ONUS
 *
 * Hiding never deletes. A hidden row leaves the room and stays on this page,
 * because the day somebody argues about what was posted, the record has to
 * still exist.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [rows, patients, reactions] = await Promise.all([
      supabase
        .from("ward_confessions")
        .select("id, author, body, created_at, hidden, featured")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("ward_patients").select("user_id, number").limit(5000),
      supabase.from("ward_same_condition").select("confession_id").limit(50000),
    ])

    const numbers = new Map<string, number>()
    for (const p of (patients.data ?? []) as { user_id: string; number: number }[]) {
      numbers.set(p.user_id, p.number)
    }
    const counts = new Map<string, number>()
    for (const r of (reactions.data ?? []) as { confession_id: string }[]) {
      counts.set(r.confession_id, (counts.get(r.confession_id) ?? 0) + 1)
    }

    const confessions = ((rows.data ?? []) as any[]).map((c) => ({
      id: String(c.id),
      number: numbers.get(String(c.author)) ?? null,
      body: String(c.body),
      createdAt: String(c.created_at),
      hidden: c.hidden === true,
      featured: c.featured === true,
      sameCondition: counts.get(String(c.id)) ?? 0,
    }))

    return NextResponse.json({
      confessions,
      total: confessions.length,
      hiddenCount: confessions.filter((c) => c.hidden).length,
    })
  } catch (e: any) {
    console.error("[admin/room] GET failed:", e)
    return NextResponse.json({ error: "Could not read the room." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const supabase = await createAdminClient()

    if ("hidden" in body) {
      const hidden = body.hidden === true
      const { error } = await supabase.from("ward_confessions").update({ hidden }).eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "room.hide", { id, hidden })
      return NextResponse.json({ saved: true })
    }

    if ("featured" in body) {
      const featured = body.featured === true
      // Only one pin at a time. Clearing first keeps the room from showing two
      // SEEN BY DR. ONUS cards, which would make the flag mean nothing.
      if (featured) {
        const { error: clearErr } = await supabase
          .from("ward_confessions").update({ featured: false }).eq("featured", true)
        if (clearErr) throw clearErr
      }
      const { error } = await supabase.from("ward_confessions").update({ featured }).eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "room.feature", { id, featured })
      return NextResponse.json({ saved: true })
    }

    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/room] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}
