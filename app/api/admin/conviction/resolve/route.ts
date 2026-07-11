import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/conviction/resolve  { contest, action: 'settle' | 'void' }
 * Desk override. 'settle' runs conviction_settle_contest (needs the window
 * elapsed and no unjudged calls). 'void' runs conviction_void_contest, which
 * refunds every call's Spins via the grants rail. Both idempotent.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const b = await request.json().catch(() => ({})) as { contest?: number; action?: string }
    const id = Number(b.contest)
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "contest required" }, { status: 400 })
    const fn = b.action === "void" ? "conviction_void_contest"
             : b.action === "settle" ? "conviction_settle_contest"
             : null
    if (!fn) return NextResponse.json({ error: "action must be settle or void" }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc(fn, { p_contest: id })
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[admin/conviction/resolve]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
