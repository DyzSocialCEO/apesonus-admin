import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** POST /api/admin/distribution/partner — add a partner (starts unlocked; lock to start accruing). */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const name = String(body.name ?? "").trim()
  const addr = String(body.sol_address ?? "").trim()
  const share = Number(body.share_pct)
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 })
  if (!B58.test(addr)) return NextResponse.json({ error: "Enter a valid Solana address" }, { status: 400 })
  if (!Number.isFinite(share) || share < 0 || share > 100) return NextResponse.json({ error: "Share must be 0–100%" }, { status: 400 })

  const supabase = await createAdminClient()
  const { data, error } = await supabase.from("pit_partners")
    .insert({ name, sol_address: addr, share_pct: share, is_locked: false, is_active: true })
    .select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
