import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/referrals/rates  { l1_pct, l2_pct }  (percentages, 0..100)
 * Stored in app_settings.pit_config as fractions (referral_l1_pct/l2_pct).
 * Forward-only: re-confirms never double-pay, so changing rates only affects
 * commissions on purchases confirmed after the change.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { l1_pct?: unknown; l2_pct?: unknown }
  const l1 = Number(body.l1_pct), l2 = Number(body.l2_pct)
  if (![l1, l2].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
    return NextResponse.json({ error: "Rates must be between 0 and 100%." }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const { data: row, error: rErr } = await supabase
    .from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  let cfg: Record<string, unknown> = {}
  const raw = row?.value as unknown
  if (typeof raw === "string") { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
  else if (raw && typeof raw === "object") cfg = raw as Record<string, unknown>

  cfg.referral_l1_pct = Math.round((l1 / 100) * 10000) / 10000
  cfg.referral_l2_pct = Math.round((l2 / 100) * 10000) / 10000

  const { error: wErr } = await supabase
    .from("app_settings").update({ value: JSON.stringify(cfg) }).eq("key", "pit_config")
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, l1_pct: cfg.referral_l1_pct, l2_pct: cfg.referral_l2_pct })
}
