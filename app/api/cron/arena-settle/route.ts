import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/arena-settle
 *
 * Settles every Arena match that has closed but is still open (status 'set',
 * closes_at in the past) by calling pit_arena_settle for each — decide the
 * winner on qualified streams, split the pool, release escrow. Idempotent.
 * Schedule every ~5 min so daily and test matches settle promptly after close.
 *
 * Auth: CRON_SECRET via ?secret= or x-admin-secret header, timing-safe.
 * Optional ?id= to force one match.
 */
function authed(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(request.url)
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret") || ""
  if (!provided) return false
  const a = Buffer.from(provided), b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try { return crypto.timingSafeEqual(a, b) } catch { return false }
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const one = new URL(request.url).searchParams.get("id")

    let ids: number[] = []
    if (one) ids = [Number(one)]
    else {
      const { data } = await supabase
        .from("pit_arena_matches").select("id")
        .eq("status", "set").lte("closes_at", new Date().toISOString())
      ids = (data || []).map((m: any) => Number(m.id))
    }

    const results = []
    for (const id of ids) {
      const { data, error } = await supabase.rpc("pit_arena_settle", { p_match: id })
      results.push({ id, ...(error ? { error: error.message } : { result: data }) })
    }
    return NextResponse.json({ ok: true, settled: ids.length, results })
  } catch (e: any) {
    console.error("[cron/arena-settle]", e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
