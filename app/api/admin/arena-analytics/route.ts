import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Read-only analytics for the arena + danger systems. Aggregates in-process;
// fine at current volume (can paginate later if backs grow large).
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()

    const [{ data: arenas }, { data: backs }, { data: events }, { data: raids }, { data: ledger }] = await Promise.all([
      supabase.from("arenas").select("id, title, status, result_track_id, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("arena_backs").select("arena_id, user_id, locked_amount, clout_burned, payout, status, is_winner"),
      supabase.from("danger_events").select("id, status, raised"),
      supabase.from("danger_raids").select("kind, amount"),
      supabase.from("onus_ledger").select("total_burned, emissions_reserve, recycled").eq("id", 1).maybeSingle(),
    ])

    const allBacks = backs || []
    const live = allBacks.filter((b) => b.status !== "void" && b.status !== "refunded")

    // global arena
    const participants = new Set(live.map((b) => b.user_id))
    const totalBacked = live.reduce((s, b) => s + Number(b.locked_amount || 0), 0)
    const totalClout = live.reduce((s, b) => s + Number(b.clout_burned || 0), 0)
    const totalPayout = live.reduce((s, b) => s + Number(b.payout || 0), 0)
    const currentlyLocked = live.filter((b) => b.status === "committed").reduce((s, b) => s + Number(b.locked_amount || 0), 0)

    // global danger
    const evs = events || []
    const dangerBurned = (raids || []).filter((r) => r.kind === "burn").reduce((s, r) => s + Number(r.amount || 0), 0)
    const dangerRaised = evs.reduce((s, e) => s + Number(e.raised || 0), 0)

    const global = {
      arenas_total: (arenas || []).length,
      arenas_settled: (arenas || []).filter((a) => a.status === "settled").length,
      arenas_live: (arenas || []).filter((a) => a.status === "open" || a.status === "revealing").length,
      total_picks: live.length,
      total_backed: totalBacked,
      currently_locked: currentlyLocked,
      total_clout_burned: totalClout,
      total_payouts: totalPayout,
      participants: participants.size,
      danger_events: evs.length,
      danger_saved: evs.filter((e) => e.status === "saved").length,
      danger_purged: evs.filter((e) => e.status === "purged").length,
      danger_raised: dangerRaised,
      danger_burned: dangerBurned,
      all_time_burned: Number(ledger?.total_burned || 0),
      emissions_reserve: Number(ledger?.emissions_reserve || 0),
    }

    // per-arena
    type Agg = { picks: number; backed: number; clout: number; payout: number; users: Set<string> }
    const byArena = new Map<string, Agg>()
    for (const b of live) {
      const a = byArena.get(b.arena_id) || { picks: 0, backed: 0, clout: 0, payout: 0, users: new Set<string>() }
      a.picks += 1
      a.backed += Number(b.locked_amount || 0)
      a.clout += Number(b.clout_burned || 0)
      a.payout += Number(b.payout || 0)
      a.users.add(b.user_id)
      byArena.set(b.arena_id, a)
    }
    const perArena = (arenas || []).map((a) => {
      const agg = byArena.get(a.id)
      return {
        id: a.id, title: a.title, status: a.status,
        picks: agg?.picks || 0,
        backed: agg?.backed || 0,
        clout: agg?.clout || 0,
        payout: agg?.payout || 0,
        participants: agg ? agg.users.size : 0,
      }
    })

    return NextResponse.json({ global, perArena })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
