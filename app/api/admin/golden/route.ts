import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/golden
 *
 * The Golden Ticket Desk snapshot: every pool with its ceilings and progress,
 * and the payout-queue summary (pending real-value claims by currency plus the
 * paid/credited totals). The full claims list lives at /claims.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    const { data: pools } = await supabase
      .from("pit_golden_pools").select("*").order("created_at", { ascending: false }).limit(50)

    const { data: tickets } = await supabase
      .from("pit_golden_tickets").select("reward_currency, value, status")

    // Queue summary. pending_payout = owed to wallets; credited = Spins already
    // given; paid = real value already sent.
    const pendingByCur: Record<string, { count: number; value: number }> = {}
    let paidCount = 0, creditedCount = 0
    for (const t of tickets || []) {
      if (t.status === "pending_payout") {
        const c = pendingByCur[t.reward_currency] ||= { count: 0, value: 0 }
        c.count += 1; c.value += Number(t.value) || 0
      } else if (t.status === "paid") paidCount += 1
      else if (t.status === "credited") creditedCount += 1
    }

    return NextResponse.json({
      pools: (pools || []).map((p) => ({
        id: p.id,
        reward_currency: p.reward_currency,
        token_mint: p.token_mint,
        sponsor: p.sponsor_name,
        total_tickets: p.total_tickets,
        tickets_remaining: p.tickets_remaining,
        value_min: Number(p.value_min),
        value_max: Number(p.value_max),
        total_pool_value: Number(p.total_pool_value),
        value_spent: Number(p.value_spent),
        max_reward_spins: Number(p.max_reward_spins),
        hit_probability: Number(p.hit_probability),
        track_scope: p.track_scope,
        status: p.status,
        created_at: p.created_at,
      })),
      queue: { pending: pendingByCur, paid_count: paidCount, credited_count: creditedCount },
    })
  } catch (e: any) {
    console.error("[admin/golden]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
