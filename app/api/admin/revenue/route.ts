import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/revenue
 * The house take. Reads pit_revenue_ledger, where every confirmed purchase
 * froze its split: house_cents is your cut, treasury_cents is the prize pool.
 * Returns totals, windows, and a 30-day daily series. Admin only, never shown
 * to players.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const { data, error } = await supabase.rpc("admin_revenue_overview")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
