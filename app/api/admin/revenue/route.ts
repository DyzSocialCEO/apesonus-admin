import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/revenue
 * The house take. Reads pit_revenue_ledger, where every confirmed purchase
 * froze its split: house_cents is your cut, treasury_cents is the prize pool.
 * Returns totals, windows, and a 30-day daily series. Admin only, never shown
 * to players.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const { data } = await supabase
    .from("pit_revenue_ledger")
    .select("usd_cents, house_cents, treasury_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(20000)

  const rows = data || []
  const now = Date.now()
  const dayMs = 86400000
  const c = (n: number) => Math.round(n) / 100

  let houseAll = 0, poolAll = 0, grossAll = 0
  let house24 = 0, house7 = 0, house30 = 0
  const byDay = new Map<string, { house: number; gross: number }>()

  for (const r of rows as any[]) {
    const house = Number(r.house_cents) || 0
    const pool = Number(r.treasury_cents) || 0
    const gross = Number(r.usd_cents) || 0
    houseAll += house; poolAll += pool; grossAll += gross
    const t = new Date(r.created_at).getTime()
    if (now - t <= dayMs) house24 += house
    if (now - t <= 7 * dayMs) house7 += house
    if (now - t <= 30 * dayMs) house30 += house
    const key = new Date(r.created_at).toISOString().slice(0, 10)
    const d = byDay.get(key) || { house: 0, gross: 0 }
    d.house += house; d.gross += gross; byDay.set(key, d)
  }

  // Last 30 calendar days, oldest first, zero-filled.
  const series: { date: string; house: number; gross: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const key = new Date(now - i * dayMs).toISOString().slice(0, 10)
    const d = byDay.get(key)
    series.push({ date: key, house: c(d?.house || 0), gross: c(d?.gross || 0) })
  }

  return NextResponse.json({
    house_total: c(houseAll), pool_total: c(poolAll), gross_total: c(grossAll),
    house_24h: c(house24), house_7d: c(house7), house_30d: c(house30),
    purchases: rows.length,
    treasury_pct: grossAll > 0 ? Math.round((poolAll / grossAll) * 100) : null,
    series,
  })
}
