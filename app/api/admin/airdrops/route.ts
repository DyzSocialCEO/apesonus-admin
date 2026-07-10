import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Airdrops: partner tokens distributed to Ember holders, proportional to Embers.
 * GET  → list drops + their allocation counts.
 * POST { action:'create', sponsor, token_symbol, token_mint, token_decimals, total_amount, dust_floor }
 *      → creates a draft.
 * POST { action:'compute', airdrop } → snapshots Embers, writes allocations.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const { data: drops } = await supabase.from("airdrops").select("*").order("created_at", { ascending: false })
  const { data: allocs } = await supabase.from("airdrop_allocations").select("airdrop_id, status")
  const byDrop: Record<number, { requested: number; sent: number; total: number }> = {}
  for (const a of allocs || []) {
    const g = (byDrop[a.airdrop_id] ||= { requested: 0, sent: 0, total: 0 })
    g.total++; if (a.status === "requested") g.requested++; if (a.status === "sent") g.sent++
  }
  return NextResponse.json({ drops: drops || [], byDrop })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await request.json().catch(() => ({})) as any
  const supabase = await createAdminClient()

  if (b.action === "create") {
    const { error } = await supabase.from("airdrops").insert({
      sponsor: String(b.sponsor || "").trim(),
      token_symbol: String(b.token_symbol || "").trim(),
      token_mint: String(b.token_mint || "").trim(),
      token_decimals: Number(b.token_decimals) || 5,
      total_amount: Number(b.total_amount) || 0,
      dust_floor: Number(b.dust_floor) || 0,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === "compute") {
    const { data, error } = await supabase.rpc("airdrop_compute", { p_airdrop: Number(b.airdrop) })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
