/**
 * USD price of one token, for converting a dollar balance into tokens at
 * payout time.
 *
 * DexScreener is used because it needs no API key and indexes pump.fun coins
 * while they are still on the bonding curve. A hand-typed price in settings
 * is the last resort for the day the feed is down, because a payout that
 * cannot be priced must not be guessed.
 */

const DEXSCREENER = "https://api.dexscreener.com/latest/dex/tokens"

async function fromDexScreener(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`${DEXSCREENER}/${mint}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = await res.json()
    const pairs: any[] = Array.isArray(body?.pairs) ? body.pairs : []
    let best: { price: number; liq: number } | null = null
    for (const p of pairs) {
      if (p?.chainId && String(p.chainId) !== "solana") continue
      const price = Number(p?.priceUsd)
      if (!Number.isFinite(price) || price <= 0) continue
      const liq = Number(p?.liquidity?.usd) || 0
      if (!best || liq > best.liq) best = { price, liq }
    }
    return best?.price ?? null
  } catch {
    return null
  }
}

export type PayoutRail =
  | { kind: "usdc" }
  | { kind: "token"; mint: string; decimals: number; symbol: string; manualPriceUsd: number }

/** Read which token winners are paid in. Defaults to USDC on anything unclear. */
export async function readPayoutRail(supabase: any): Promise<PayoutRail> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["pay_rail", "onus_mint", "onus_decimals", "onus_symbol", "onus_manual_price_usd"])
    const s: Record<string, string> = {}
    for (const r of data || []) s[String(r.key)] = String(r.value ?? "")

    if ((s.pay_rail || "usdc").trim().toLowerCase() !== "onus") return { kind: "usdc" }

    const mint = (s.onus_mint || "").trim()
    if (mint.length < 32 || mint.length > 44) return { kind: "usdc" }

    const d = Number(s.onus_decimals)
    const decimals = Number.isFinite(d) && d >= 0 && d <= 12 ? Math.round(d) : 6
    const m = Number(s.onus_manual_price_usd)
    const manualPriceUsd = Number.isFinite(m) && m > 0 ? m : 0
    const symbol = (s.onus_symbol || "ONUS").trim().toUpperCase().slice(0, 10) || "ONUS"

    return { kind: "token", mint, decimals, symbol, manualPriceUsd }
  } catch {
    return { kind: "usdc" }
  }
}

/**
 * How many tokens settle a dollar debt right now.
 * Returns null when no price is trustworthy, and the caller must refuse to
 * send rather than pick a number.
 */
export async function tokensForUsd(
  rail: Extract<PayoutRail, { kind: "token" }>,
  amountUsd: number,
): Promise<{ tokens: number; priceUsd: number; source: string } | null> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null

  const live = await fromDexScreener(rail.mint)
  const priceUsd = live ?? (rail.manualPriceUsd > 0 ? rail.manualPriceUsd : 0)
  if (!priceUsd) return null

  const tokens = amountUsd / priceUsd
  if (!Number.isFinite(tokens) || tokens <= 0) return null

  return { tokens, priceUsd, source: live ? "dexscreener" : "manual" }
}
