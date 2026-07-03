import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/settle  { week }
 *
 * Manually settles a co-sign week via pit_cosign_settle (idempotent — a
 * settled week no-ops). The weekly cron does this automatically; this is the
 * by-hand path for testing or a missed run. week = that week's Monday (UTC).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { week?: string }
  if (!body.week || !/^\d{4}-\d{2}-\d{2}$/.test(body.week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD (that week's Monday)." }, { status: 400 })
  }

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("pit_cosign_settle", { p_week: body.week })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, week: body.week, result: data })
  } catch (e: any) {
    console.error("[admin/cosign/settle]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
