import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/floor-analytics
 *
 * One call for the Floor Analytics page. Pulls the economy (Ammo in, out,
 * and held), the war (Node Power by faction), the week (epoch + purse), and
 * a 14-day trend of qualified plays and revenue. Read-only.
 */

const ROSTER: Record<string, string> = {
  "chartnobyl-bro": "Chartnobyl Bro", "coinalisa": "Coinalisa",
  "lola-likwidity": "Lola Likwidity", "mcbagholder": "McBagholder",
  "dj-dustwallet": "DJ Dustwallet", "shilliam-dafoe": "Shilliam Dafoe", "satosheek": "Satosheek",
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [
      balancesRes, purchasesRes, grantsRes, nodesRes, statsRes, cfgRes,
      ammoCountRes, freeCountRes, playsRes,
    ] = await Promise.all([
      supabase.from("pit_ammo_balances").select("user_id, balance"),
      supabase.from("pit_ammo_purchases").select("ammo_amount, usd_cents, status, created_at"),
      supabase.from("pit_ammo_grants").select("amount"),
      supabase.from("pit_nodes").select("artist_id, np"),
      supabase.from("pit_artist_stats").select("artist_id, lifetime_streams"),
      supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle(),
      supabase.from("pit_qualified_plays").select("id", { count: "exact", head: true }).eq("source", "ammo"),
      supabase.from("pit_qualified_plays").select("id", { count: "exact", head: true }).eq("source", "free_daily"),
      supabase.from("pit_qualified_plays").select("source, played_at").gte("played_at", since.toISOString()),
    ])

    // ── Economy ──
    const balances = balancesRes.data || []
    const outstanding = balances.reduce((s, r) => s + Number(r.balance || 0), 0)
    const holders = balances.filter((r) => Number(r.balance || 0) > 0).length

    const purchases = purchasesRes.data || []
    const counts = { pending: 0, confirmed: 0, expired: 0, failed: 0 }
    let ammoSold = 0, usdGrossCents = 0
    for (const p of purchases) {
      counts[(p.status as keyof typeof counts)] = (counts[(p.status as keyof typeof counts)] || 0) + 1
      if (p.status === "confirmed") { ammoSold += Number(p.ammo_amount || 0); usdGrossCents += Number(p.usd_cents || 0) }
    }
    const ammoGranted = (grantsRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const ammoSpent = ammoCountRes.count || 0
    const freeServed = freeCountRes.count || 0

    // ── War ──
    const totals: Record<string, number> = {}
    const players: Record<string, number> = {}
    for (const r of nodesRes.data || []) {
      const np = Number(r.np || 0)
      totals[r.artist_id] = (totals[r.artist_id] || 0) + np
      if (np > 0) players[r.artist_id] = (players[r.artist_id] || 0) + 1
    }
    const streams: Record<string, number> = {}
    for (const r of statsRes.data || []) streams[r.artist_id] = Number(r.lifetime_streams || 0)
    const factions = Object.keys(ROSTER)
      .map((id) => ({
        artist_id: id, name: ROSTER[id],
        total_np: totals[id] || 0, players: players[id] || 0, lifetime_streams: streams[id] || 0,
      }))
      .sort((a, b) => b.total_np - a.total_np)
    const totalNp = Object.values(totals).reduce((s, v) => s + v, 0)

    // ── Week ──
    const cfg = (cfgRes.data?.value ? JSON.parse(cfgRes.data.value) : {}) as any
    const currentEpoch = Number(cfg.current_epoch_number || 0)
    let epoch: any = null
    if (currentEpoch > 0) {
      const { data: e } = await supabase
        .from("pit_epochs")
        .select("epoch_number, status, purse_usd, sponsor_name, winner_artist_id, paid_total, total_board_np, snapshot_at")
        .eq("epoch_number", currentEpoch).maybeSingle()
      if (e) epoch = { ...e, winner_name: e.winner_artist_id ? (ROSTER[e.winner_artist_id] || e.winner_artist_id) : null }
    }

    // ── 14-day series ──
    const days: string[] = []
    const idx: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const k = dayKey(d); idx[k] = days.length; days.push(k.slice(5)) // MM-DD label
    }
    const playsAmmo = new Array(days.length).fill(0)
    const playsFree = new Array(days.length).fill(0)
    for (const p of playsRes.data || []) {
      const k = dayKey(new Date(p.played_at))
      const i = idx[k]; if (i === undefined) continue
      if (p.source === "ammo") playsAmmo[i]++; else if (p.source === "free_daily") playsFree[i]++
    }
    const revenueCents = new Array(days.length).fill(0)
    for (const p of purchases) {
      if (p.status !== "confirmed") continue
      const k = dayKey(new Date(p.created_at))
      const i = idx[k]; if (i === undefined) continue
      revenueCents[i] += Number(p.usd_cents || 0)
    }
    const series = days.map((label, i) => ({
      day: label, ammo: playsAmmo[i], free: playsFree[i], usd: revenueCents[i] / 100,
    }))

    // ── People: top holders ──
    const topBal = [...balances].filter((b) => Number(b.balance) > 0)
      .sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 8)
    let topHolders: any[] = []
    if (topBal.length) {
      const { data: users } = await supabase
        .from("users").select("id, display_name, email").in("id", topBal.map((b) => b.user_id))
      const nameOf = (id: string) => {
        const u = (users || []).find((x: any) => x.id === id)
        return u?.display_name || u?.email || id.slice(0, 8)
      }
      topHolders = topBal.map((b) => ({ name: nameOf(b.user_id), balance: Number(b.balance) }))
    }

    // ── Community engagement: top players by weighted NP (the payout metric) ──
    let engagementTop: any[] = []
    try {
      const { data: topRows } = await supabase.rpc("pit_engagement_top", { p_limit: 12 })
      const ids = (topRows || []).map((r: any) => r.user_id)
      const nameById: Record<string, string> = {}
      if (ids.length) {
        const { data: us } = await supabase.from("users").select("id, display_name, email").in("id", ids)
        for (const u of us || []) nameById[u.id] = (u.display_name || u.email || String(u.id).slice(0, 8)) as string
      }
      engagementTop = (topRows || []).map((r: any) => ({
        name: nameById[r.user_id] || String(r.user_id).slice(0, 8),
        share: Number(r.share || 0),
        rank: Number(r.rnk || 0),
        weight: Number(r.weight || 0),
      }))
    } catch {}

    return NextResponse.json({
      economy: { outstanding, holders, ammoSold, usdGrossCents, ammoGranted, ammoSpent, freeServed, counts },
      war: { totalNp, qualifiedPlays: (ammoSpent + freeServed), factions },
      engagement: engagementTop,
      week: { currentEpoch, epoch },
      series,
      people: { topHolders },
    })
  } catch (e: any) {
    console.error("[admin/floor-analytics] error:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
