import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/conviction-open
 * When conviction_auto_daily is 'true' and nothing is open, opens tomorrow's
 * contest via conviction_auto_open (clones the last contest's frozen dials).
 * When off, a no-op. Schedule daily just after the 11:50 UTC lock. Auth: CRON_SECRET.
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
    const { data: flag } = await supabase.from("app_settings").select("value").eq("key", "conviction_auto_daily").maybeSingle()
    if (flag?.value !== "true") return NextResponse.json({ ok: true, skipped: "auto_off" })
    const { data, error } = await supabase.rpc("conviction_auto_open")
    if (error) throw error
    return NextResponse.json({ ok: true, ...(data as object) })
  } catch (e: any) {
    console.error("[conviction-open]", e?.message || e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
