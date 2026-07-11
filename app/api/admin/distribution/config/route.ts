import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/admin/distribution/config — set pool %s (must total 100), wallets, lock. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const ops = Number(body.ops_pct), team = Number(body.team_pct), eco = Number(body.eco_pct)
  if (![ops, team, eco].every((n) => Number.isFinite(n) && n >= 0 && n <= 100))
    return NextResponse.json({ error: "Percentages must be 0–100" }, { status: 400 })
  if (Math.round((ops + team + eco) * 100) !== 10000)
    return NextResponse.json({ error: "Operational + Team + Ecosystem must total 100%" }, { status: 400 })

  const supabase = await createAdminClient()
  const { data: cur } = await supabase.from("pit_distribution_config").select("*").eq("id", 1).maybeSingle()

  // %s editable only when not locked (or when this same call unlocks).
  const canEditPct = !cur?.is_locked || body.is_locked === false
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (canEditPct) { patch.ops_pct = ops; patch.team_pct = team; patch.eco_pct = eco }
  if (typeof body.ops_wallet === "string") patch.ops_wallet = body.ops_wallet.trim() || null
  if (typeof body.eco_wallet === "string") patch.eco_wallet = body.eco_wallet.trim() || null
  if (typeof body.is_locked === "boolean") patch.is_locked = body.is_locked

  const { error } = await supabase.from("pit_distribution_config").update(patch).eq("id", 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pct_changed: canEditPct })
}
