import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/admin/distribution — pools, partners (accrued/paid/owed), recent payouts. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const { data, error } = await supabase.rpc("pit_distribution_overview")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: payouts } = await supabase
    .from("pit_partner_payouts")
    .select("id, partner_id, amount_cents, tx_signature, method, status, note, created_at")
    .order("created_at", { ascending: false }).limit(25)
  return NextResponse.json({ ...(data as Record<string, unknown>), payouts: payouts ?? [] })
}
