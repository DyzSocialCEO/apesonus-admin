import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { anchorRevenue } from "@/lib/onus-chain/revenue-anchor"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/revenue-anchor
 *
 * Snapshots cumulative revenue + the pool split + total paid, chains + hashes
 * it, and anchors the hash on Solana (SPL Memo). Skips when nothing moved.
 * Independent of the play-chain anchor.
 *
 * Auth: CRON_SECRET via x-admin-secret header or ?secret= query param
 * (the same secret the play-chain anchor uses). Schedule every 15–60 min.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(request.url)
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret")
  if (!secret || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const res = await anchorRevenue(supabase)
    return NextResponse.json(res, { status: res.ok ? 200 : 500 })
  } catch (e) {
    console.error("[revenue-anchor]", (e as Error).message)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
