import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/finance
 *
 * The money, in the token it actually arrives in.
 *
 * Every confirmed order in pit_ammo_purchases carries the exact amount paid
 * (pay_amount_base, in the token's smallest unit), the dollar price it was
 * quoted at (usd_cents, frozen at sale), and the days it bought. This route
 * adds those up per rail, fetches the live price for the mint currently
 * configured, and reports both numbers side by side: what the dollars were
 * worth on the day, and what the tokens are worth now.
 *
 * Deliberately dumb: no ratios, no derived stats, no old-economy counters.
 */

type Row = {
  pay_amount_base: number | null
  usd_cents: number | null
  ammo_amount: number | null
  rail: string | null
  created_at: string
}

async function livePriceUsd(mint: string): Promise<number | null> {
  if (!mint) return null
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { pairs?: { priceUsd?: string; liquidity?: { usd?: number } }[] }
    // Most liquid pair wins; a thin pool can print a nonsense price.
    let best = -1
    let price: number | null = null
    for (const p of data.pairs ?? []) {
      const v = Number(p?.priceUsd)
      const liq = Number(p?.liquidity?.usd ?? 0)
      if (Number.isFinite(v) && v > 0 && liq > best) {
        best = liq
        price = v
      }
    }
    return price
  } catch {
    return null
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()

    // The economy, counted BY THE DATABASE. Pulling rows and counting them
    // here breaks silently the moment a table passes a thousand rows, because
    // a response is capped there and every number quietly stops moving.
    const [{ data: settings }, { data: rows }, held, granted, doses, refills, courtesy, accounts] = await Promise.all([
      supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["pay_rails", "pay_rail", "onus_mint", "onus_decimals", "onus_symbol", "helius_treasury_wallet"]),
      supabase
        .from("pit_ammo_purchases")
        .select("pay_amount_base, usd_cents, ammo_amount, rail, created_at")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(50000),
      // Spins sitting in patients' hands, unspent. This is the liability.
      supabase.rpc("ward_spins_held"),
      // Spins handed out rather than sold: the starter grant, the refills and
      // anything given by hand at the desk.
      supabase.rpc("ward_spins_given"),
      supabase.from("ward_doses").select("id", { count: "exact", head: true }),
      supabase.from("ward_spin_state").select("refill_high", { count: "exact", head: true }).gt("refill_high", 0),
      supabase.from("ward_sessions").select("id", { count: "exact", head: true }).eq("source", "courtesy"),
      supabase.from("ward_spin_state").select("user_id", { count: "exact", head: true }),
    ])

    const s = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, String(r.value ?? "")]))
    const mint = (s.get("onus_mint") || "").trim()
    const symbol = (s.get("onus_symbol") || "TOKEN").trim().toUpperCase()
    const decimals = Math.min(12, Math.max(0, Math.round(Number(s.get("onus_decimals")) || 6)))
    // What the till accepts, for the label at the bottom of the desk. The
    // pair wins when it has ever been saved; the legacy single key otherwise.
    let railName = (s.get("pay_rail") || "usdc").trim().toLowerCase()
    try {
      const parsed = JSON.parse(String(s.get("pay_rails") ?? "null"))
      if (Array.isArray(parsed) && parsed.length > 0) railName = parsed.join(" + ")
    } catch {}
    const wallet = (s.get("helius_treasury_wallet") || "").trim()

    const all = (rows ?? []) as Row[]
    const unit = 10 ** decimals

    // Token rail (what the clinic sells in now) and the stable rail
    // (anything taken before the switch) are kept apart on purpose:
    // adding them would invent a number that never existed.
    const token = all.filter((r) => (r.rail || "").toLowerCase() === "onus")
    const stable = all.filter((r) => (r.rail || "").toLowerCase() !== "onus")

    const tokenReceived = token.reduce((a, r) => a + Number(r.pay_amount_base || 0), 0) / unit
    const tokenUsdAtSale = token.reduce((a, r) => a + Number(r.usd_cents || 0), 0) / 100
    const stableUsd = stable.reduce((a, r) => a + Number(r.usd_cents || 0), 0) / 100
    const daysSold = all.reduce((a, r) => a + Number(r.ammo_amount || 0), 0)

    const price = await livePriceUsd(mint)
    const tokenValueNow = price != null ? tokenReceived * price : null

    // Thirty days, oldest first, so the chart reads left to right.
    const byDay = new Map<string, { date: string; token: number; usd: number; payments: number }>()
    const cutoff = Date.now() - 30 * 86400_000
    for (const r of all) {
      const t = new Date(r.created_at).getTime()
      if (!Number.isFinite(t) || t < cutoff) continue
      const date = new Date(t).toISOString().slice(0, 10)
      const cur = byDay.get(date) ?? { date, token: 0, usd: 0, payments: 0 }
      if ((r.rail || "").toLowerCase() === "onus") cur.token += Number(r.pay_amount_base || 0) / unit
      cur.usd += Number(r.usd_cents || 0) / 100
      cur.payments += 1
      byDay.set(date, cur)
    }
    const series = Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1))

    const dayMs = 86400_000
    const since = (ms: number) =>
      all.filter((r) => Date.now() - new Date(r.created_at).getTime() <= ms)
    const usdIn = (list: Row[]) => list.reduce((a, r) => a + Number(r.usd_cents || 0), 0) / 100

    // What the packs cost against what they give, so the price list can be
    // read as a rate rather than as three numbers.
    const spinsSold = all.reduce((a, r) => a + Number(r.ammo_amount || 0), 0)
    const usdTotal = all.reduce((a, r) => a + Number(r.usd_cents || 0), 0) / 100
    const spinsPerDollar = usdTotal > 0 ? spinsSold / usdTotal : 0

    return NextResponse.json({
      economy: {
        accounts: Number((accounts as any)?.count ?? 0),
        spinsSold,
        spinsHeld: Number((held as any)?.data ?? 0),
        givenStarter: Number((granted as any)?.data?.starter ?? 0),
        givenRefills: Number((granted as any)?.data?.refills ?? 0),
        dosesTaken: Number((doses as any)?.count ?? 0),
        refilledAccounts: Number((refills as any)?.count ?? 0),
        courtesyTreatments: Number((courtesy as any)?.count ?? 0),
        spinsPerDollar,
        // What the clinic hands over for nothing, against what it sells. A
        // rate, so it can be read without doing the sum in your head.
        givenPct: (() => {
          const given = Number((granted as any)?.data?.starter ?? 0) + Number((granted as any)?.data?.refills ?? 0)
          return spinsSold > 0 ? (given / spinsSold) * 100 : 0
        })(),
      },
      rail: railName,
      symbol,
      mint,
      wallet,
      price,
      payments: all.length,
      daysSold,
      tokenReceived,
      tokenUsdAtSale,
      tokenValueNow,
      stableUsd,
      usd24h: usdIn(since(dayMs)),
      usd7d: usdIn(since(7 * dayMs)),
      usd30d: usdIn(since(30 * dayMs)),
      series,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
