import { NextResponse } from "next/server"
import { createAdminClient, createServiceClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/diag — one-screen truth about the admin's database view.
 *
 * Built to settle the "Spins page shows all zeros" mystery. Reports:
 *   - which Supabase project this deployment points at (host only, no keys)
 *   - whether the service-role key env var is present
 *   - for each key table, the row count as seen by BOTH clients:
 *       cookie-bound createAdminClient (what all routes currently use, and
 *       what the lib's own comments warn can downgrade off service_role)
 *       vs cookieless createServiceClient (pure service role)
 *   - every query error, verbatim, instead of swallowing them
 *
 * Reading the result:
 *   - wrong/unexpected supabase_host        -> env vars point at another project
 *   - cookie client errors, service works   -> the documented downgrade bug
 *   - both work with real counts            -> the ammo PAGE fetch is the problem
 */

const TABLES = ["users", "tracks", "pit_ammo_balances", "pit_ammo_grants", "pit_qualified_plays"] as const

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  let host = "MISSING"
  try { host = url ? new URL(url).host : "MISSING" } catch { host = "INVALID: " + url.slice(0, 30) }

  const out: Record<string, unknown> = {
    supabase_host: host,
    service_role_key_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    checked_at: new Date().toISOString(),
  }

  // Cookie-bound client (current default everywhere).
  const cookieResults: Record<string, string> = {}
  try {
    const cookieClient = await createAdminClient()
    for (const t of TABLES) {
      const { count, error } = await cookieClient.from(t).select("*", { count: "exact", head: true })
      cookieResults[t] = error ? `ERROR: ${error.message}` : `count=${count}`
    }
  } catch (e) {
    cookieResults["_client"] = `THREW: ${e instanceof Error ? e.message : String(e)}`
  }
  out.cookie_bound_client = cookieResults

  // Cookieless pure service-role client.
  const serviceResults: Record<string, string> = {}
  try {
    const svc = createServiceClient()
    for (const t of TABLES) {
      const { count, error } = await svc.from(t).select("*", { count: "exact", head: true })
      serviceResults[t] = error ? `ERROR: ${error.message}` : `count=${count}`
    }
    // The number that must match the founder's profile if this is the right DB.
    const { data: balances, error: balErr } = await svc.from("pit_ammo_balances").select("balance")
    if (!balErr) {
      const outstanding = (balances || []).reduce((a: number, b: any) => a + Number(b.balance || 0), 0)
      serviceResults["_outstanding_spins_total"] = String(outstanding)
    } else {
      serviceResults["_outstanding_spins_total"] = `ERROR: ${balErr.message}`
    }
  } catch (e) {
    serviceResults["_client"] = `THREW: ${e instanceof Error ? e.message : String(e)}`
  }
  out.service_client = serviceResults

  return NextResponse.json(out)
}
