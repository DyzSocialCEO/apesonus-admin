/**
 * Conviction — launch feed (Moralis Pump.fun API).
 *
 * One job: give the feed cron a normalized list of fresh Pump.fun tokens with
 * on-chain-authoritative numbers. mcap = fullyDilutedValuation (all Pump.fun
 * tokens are 1B supply, so FDV = mcap); liquidity comes straight from the
 * bonding curve pre-graduation. Volume is NEVER read — it's wash-tradeable.
 *
 * Endpoints (X-API-Key header, MORALIS_API_KEY env):
 *   GET /token/mainnet/exchange/pumpfun/new?limit=100      — newest launches
 *   GET /token/mainnet/exchange/pumpfun/bonding?limit=100  — bonding phase
 * Both paginate with ?cursor=. Per-token endpoints (/price, /bonding-status,
 * /pairs) are the Phase 3 resolver's tools, not the board's.
 */

const BASE = "https://solana-gateway.moralis.io/token/mainnet"

export interface FeedToken {
  mint: string
  symbol: string | null
  name: string | null
  logo: string | null
  priceUsd: number
  mcap: number          // fullyDilutedValuation, USD
  liquidity: number     // USD
  createdAt: string | null
  source: "moralis"
}

function key(): string {
  const k = process.env.MORALIS_API_KEY
  if (!k) throw new Error("MORALIS_API_KEY is not set")
  return k
}

async function page(path: string, cursor?: string): Promise<{ tokens: FeedToken[]; cursor: string | null }> {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
  const res = await fetch(url, { headers: { accept: "application/json", "X-API-Key": key() }, cache: "no-store" })
  if (!res.ok) throw new Error(`moralis ${path}: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300))
  const data = await res.json()
  const rows: any[] = Array.isArray(data?.result) ? data.result : []
  return {
    tokens: rows.map((t) => ({
      mint: String(t.tokenAddress || ""),
      symbol: t.symbol ?? null,
      name: t.name ?? null,
      logo: t.logo ?? null,
      priceUsd: Number(t.priceUsd) || 0,
      mcap: Number(t.fullyDilutedValuation) || 0,
      liquidity: Number(t.liquidity) || 0,
      createdAt: t.createdAt ?? null,
      source: "moralis" as const,
    })).filter((t) => t.mint),
    cursor: data?.cursor || null,
  }
}

/**
 * Pull the freshest Pump.fun tokens: the `new` feed plus the `bonding` feed
 * (bounded pages each — the board only wants today's sub-$20k launches, which
 * always live in the first pages). Deduped by mint; `new` rows win on clash
 * since their createdAt is authoritative for launch time.
 */
export async function fetchFreshLaunches(maxPagesEach = 2): Promise<FeedToken[]> {
  const byMint = new Map<string, FeedToken>()

  for (const path of ["/exchange/pumpfun/bonding", "/exchange/pumpfun/new"]) {
    let cursor: string | null = null
    for (let i = 0; i < maxPagesEach; i++) {
      const { tokens, cursor: next } = await page(path, cursor || undefined)
      for (const t of tokens) byMint.set(t.mint, t) // later loop (new) overwrites
      if (!next || tokens.length === 0) break
      cursor = next
    }
  }
  return Array.from(byMint.values())
}

/** The board gauntlet at add time. Pump.fun launches ship with mint+freeze
 *  authority revoked by design (enforced by the program), so authority_ok is
 *  true for anything the Pump.fun feed returns; the per-day resolver re-checks
 *  everything against chain state anyway. */
export function eligibleForBoard(t: FeedToken, cfg: {
  opens_at: string; call_ceiling_mcap: number; liq_floor_usd: number
}): boolean {
  if (!t.createdAt) return false
  if (new Date(t.createdAt).getTime() < new Date(cfg.opens_at).getTime()) return false // launched after the board opened
  if (!(t.mcap > 0) || t.mcap >= cfg.call_ceiling_mcap) return false
  if (t.liquidity < cfg.liq_floor_usd) return false
  return true
}
