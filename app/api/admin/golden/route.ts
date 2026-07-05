import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/golden
 *
 * Golden Ticket Desk snapshot, raffle model: every campaign with sponsor, pool,
 * tiers, timing, live entry count, status; plus the payout-queue summary.
 * Campaigns past their end time and still 'live' are flagged ready_to_draw.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const now = Date.now()

    const { data: campaigns } = await supabase
      .from("pit_gt_campaigns").select("*").order("created_at", { ascending: false }).limit(50)

    const ids = (campaigns || []).map((c: any) => c.id)
    const counts: Record<number, number> = {}
    if (ids.length) {
      const { data: entries } = await supabase
        .from("pit_gt_entries").select("campaign_id").in("campaign_id", ids)
      for (const e of entries || []) counts[e.campaign_id] = (counts[e.campaign_id] || 0) + 1
    }

    const list = (campaigns || []).map((c: any) => {
      const ended = new Date(c.ends_at).getTime() <= now
      return {
        id: c.id, sponsor_name: c.sponsor_name, sponsor_url: c.sponsor_url,
        reward_currency: c.reward_currency, token_mint: c.token_mint,
        total_pool_value: Number(c.total_pool_value) || 0, spins_pot: Number(c.spins_pot) || 0,
        tiers: c.tiers, activation_threshold: c.activation_threshold,
        starts_at: c.starts_at, ends_at: c.ends_at, status: c.status,
        settled_at: c.settled_at, draw_summary: c.draw_summary,
        entries: counts[c.id] || 0, ready_to_draw: c.status === "live" && ended,
      }
    })

    const { data: tickets } = await supabase.from("pit_golden_tickets").select("reward_currency, value, status")
    const pendingByCur: Record<string, { count: number; value: number }> = {}
    let paidCount = 0, creditedCount = 0
    for (const t of tickets || []) {
      if (t.status === "pending_payout") {
        const g = pendingByCur[t.reward_currency] ||= { count: 0, value: 0 }
        g.count += 1; g.value += Number(t.value) || 0
      } else if (t.status === "paid") paidCount += 1
      else if (t.status === "credited") creditedCount += 1
    }

    return NextResponse.json({
      campaigns: list,
      queue: { pending: pendingByCur, paid_count: paidCount, credited_count: creditedCount },
    })
  } catch (e: any) {
    console.error("[admin/golden]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
