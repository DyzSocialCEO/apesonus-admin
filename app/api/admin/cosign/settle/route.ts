import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { captureDrawSeed } from "@/lib/draw-seed"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/settle   { week? }
 *
 * Runs the backing draw for a round via pit_cosign_settle (idempotent — a
 * settled round no-ops). With no body it settles the CURRENT round (the latest
 * open one) — the one-click "settle now" used for the test timer. Pass a week
 * key to settle a specific past round. The weekly cron does this automatically.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { week?: string }
  try {
    const supabase = await createAdminClient()
    let week = body.week && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : null
    if (!week) {
      const { data } = await supabase.from("pit_cosign_pools").select("week_start").eq("status", "set").order("closes_at", { ascending: false }).limit(1).maybeSingle()
      week = data?.week_start || null
    }
    if (!week) return NextResponse.json({ error: "No round to settle." }, { status: 400 })

    const seed = await captureDrawSeed()
    const { data, error } = await supabase.rpc("pit_cosign_settle", { p_week: week, p_seed: seed?.seed ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (seed) await supabase.from("pit_cosign_pools").update({ seed_slot: seed.slot }).eq("week_start", week)
    return NextResponse.json({ ok: true, week, seeded: !!seed, result: data })
  } catch (e: any) {
    console.error("[admin/cosign/settle]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
