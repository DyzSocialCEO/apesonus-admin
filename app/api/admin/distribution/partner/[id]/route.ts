import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/**
 * POST /api/admin/distribution/partner/[id]  { action }
 *   lock   — start accruing (validates total locked ≤ 100% of team pool)
 *   unlock — pause / allow edits
 *   update — edit name / address / share (must be unlocked)
 *   remove — deactivate (history kept)
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = Number(params.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }
  const action = String(body.action ?? "")

  const supabase = await createAdminClient()
  const { data: p } = await supabase.from("pit_partners").select("*").eq("id", id).maybeSingle()
  if (!p) return NextResponse.json({ error: "Partner not found" }, { status: 404 })

  if (action === "lock") {
    const { data: others } = await supabase.from("pit_partners")
      .select("share_pct").eq("is_active", true).eq("is_locked", true).neq("id", id)
    const sum = (others ?? []).reduce((a, r: { share_pct: number }) => a + Number(r.share_pct), 0) + Number(p.share_pct)
    if (sum > 100.0001) return NextResponse.json({ error: `Locking would allocate ${sum}% of the team pool (max 100%)` }, { status: 400 })
    const { error } = await supabase.from("pit_partners").update({ is_locked: true }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === "unlock") {
    const { error } = await supabase.from("pit_partners").update({ is_locked: false }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === "update") {
    if (p.is_locked) return NextResponse.json({ error: "Unlock the partner before editing" }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (typeof body.name === "string") { const n = body.name.trim(); if (!n) return NextResponse.json({ error: "Name required" }, { status: 400 }); patch.name = n }
    if (typeof body.sol_address === "string") { const a = body.sol_address.trim(); if (!B58.test(a)) return NextResponse.json({ error: "Enter a valid Solana address" }, { status: 400 }); patch.sol_address = a }
    if (body.share_pct !== undefined) { const s = Number(body.share_pct); if (!Number.isFinite(s) || s < 0 || s > 100) return NextResponse.json({ error: "Share must be 0–100%" }, { status: 400 }); patch.share_pct = s }
    const { error } = await supabase.from("pit_partners").update(patch).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === "remove") {
    const { error } = await supabase.from("pit_partners").update({ is_active: false, is_locked: false }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
