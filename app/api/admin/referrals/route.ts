import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/admin/referrals — totals, top referrers (earnings), recent commissions. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const { data, error } = await supabase.rpc("pit_referral_admin")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as Record<string, unknown>)
}
