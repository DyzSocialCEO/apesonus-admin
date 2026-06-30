import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/partner/overview — gross + pool split + THIS partner's cut only. */
export async function GET() {
  const s = await getSession()
  if (!s || s.role !== "partner" || !s.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = await createAdminClient()
  const { data, error } = await supabase.rpc("pit_partner_portal", { p_partner_id: Number(s.partnerId) })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as Record<string, unknown>)
}
