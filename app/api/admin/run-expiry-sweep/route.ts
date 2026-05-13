import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/run-expiry-sweep
 *
 * Admin-only trigger that calls the main app's cron expiry route.
 * The main app's route is on a different origin and requires
 * CRON_SECRET — we hold that secret server-side and never expose
 * it to the browser.
 *
 * Two paths supported:
 *   1. If MAIN_APP_URL is set, we proxy to its
 *      /api/cron/expire-subscriptions with the secret.
 *   2. Fallback: call the DB function directly via service-role.
 *      Functionally equivalent — they call the same RPC.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const mainAppUrl = process.env.MAIN_APP_URL
  const cronSecret = process.env.CRON_SECRET

  // Path 1: proxy to main app
  if (mainAppUrl && cronSecret) {
    try {
      const url = `${mainAppUrl.replace(/\/$/, "")}/api/cron/expire-subscriptions`
      const res = await fetch(url, {
        method: "GET",
        headers: { "x-cron-secret": cronSecret },
        cache: "no-store",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json(
          { error: body.error || `Proxy failed (${res.status})` },
          { status: 502 },
        )
      }
      const supabase = await createAdminClient()
      await logAdminAction(supabase, request, session.username, "subscription.run_sweep", {
        via: "main_app_proxy",
        expiredCount: body.expiredCount,
      })
      return NextResponse.json(body)
    } catch (err) {
      console.error("[run-expiry-sweep proxy]", err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Proxy error" },
        { status: 502 },
      )
    }
  }

  // Path 2: direct DB call (same effect)
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.rpc("expire_subscriptions")
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data

    await logAdminAction(supabase, request, session.username, "subscription.run_sweep", {
      via: "direct_rpc",
      expiredCount: row?.expired_count ?? 0,
    })

    return NextResponse.json({
      ok: true,
      expiredCount: row?.expired_count ?? 0,
      sweptAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[run-expiry-sweep direct]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}
