import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/arena/settle  { id }
 * Settle a match now (decide the winner on qualified streams, pay the pool).
 * Idempotent — a settled match returns { already:true }.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = (await request.json().catch(() => ({}))) as { id?: number }
  const matchId = Number(id)
  if (!Number.isFinite(matchId) || matchId <= 0) return NextResponse.json({ error: "id required" }, { status: 400 })
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("pit_arena_settle", { p_match: matchId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, result: data })
  } catch (e: any) {
    console.error("[admin/arena/settle]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
