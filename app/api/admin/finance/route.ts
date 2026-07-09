import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/finance
 * The parent money view. fin_reconcile() (Spins invariant + USDC position)
 * plus per-feature P&L counts. Admin only.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    const [{ data: rec, error: recErr }, freeRes, backRes, convRes] = await Promise.all([
      supabase.rpc("fin_reconcile"),
      supabase.from("pit_qualified_plays").select("id", { count: "exact", head: true }).eq("source", "free_daily"),
      supabase.from("pit_cosign_pools").select("week_start", { count: "exact", head: true }).eq("status", "settled"),
      supabase.from("conviction_calls").select("id", { count: "exact", head: true }),
    ])
    if (recErr) throw recErr

    const r = (rec || {}) as Record<string, any>
    const by = r?.spins?.by_reason || {}
    const num = (v: unknown) => Number(v) || 0

    const purchasedSpins = num(by.purchase)
    const grossCents = num(r?.usdc_cents?.gross)
    const blended = purchasedSpins > 0 ? grossCents / purchasedSpins : null

    const referralSpins = Object.entries(by)
      .filter(([k]) => k.startsWith("referral_"))
      .reduce((a, [, v]) => a + num(v), 0)
    const grantSpins = Object.entries(by)
      .filter(([k]) => k.startsWith("grant:"))
      .reduce((a, [, v]) => a + num(v), 0)

    return NextResponse.json({
      reconcile: r,
      blended_cents_per_spin: blended,
      pnl: {
        music: { spins_burned: -num(by.play), free_plays_served: freeRes.count || 0 },
        back: { rounds_settled: backRes.count || 0, pool_spins_paid: num(by["grant:cosign_win"]) },
        conviction: {
          calls: convRes.count || 0,
          entry_spins: -num(by.conviction_entry),
          queued_prizes_usd: num(r?.usdc_cents?.conviction_queued_prizes_usd),
          open_pot_ceilings_usd: num(r?.usdc_cents?.conviction_open_pot_ceilings_usd),
        },
        referrals: { commission_spins: referralSpins },
        grants_total_spins: grantSpins,
      },
    })
  } catch (e: any) {
    console.error("[admin/finance]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
