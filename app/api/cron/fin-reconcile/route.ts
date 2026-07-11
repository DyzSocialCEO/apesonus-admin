import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/fin-reconcile
 * Runs fin_reconcile(), logs the snapshot to fin_reconcile_log, and on any
 * nonzero Spins drift also writes an error_logs row so the Logs page shows
 * it. Schedule daily. Auth: CRON_SECRET via ?secret= or x-admin-secret.
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
    const { data, error } = await supabase.rpc("fin_reconcile")
    if (error) throw error

    const r = (data || {}) as Record<string, any>
    const drift = Number(r?.spins?.drift) || 0
    const ok = drift === 0

    await supabase.from("fin_reconcile_log").insert({ drift, ok, report: r })

    if (!ok) {
      await supabase.from("error_logs").insert({
        source: "fin-reconcile",
        severity: "error",
        message: `Spins ledger drift detected: ${drift}. Ledger net does not equal balances. Investigate before any payout.`,
        extra: r,
      })
    }

    return NextResponse.json({ ok, drift })
  } catch (e: any) {
    console.error("[fin-reconcile]", e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
