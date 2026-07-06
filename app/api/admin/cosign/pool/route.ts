import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/pool
 *   { week_start?, sponsor_name?, sponsor_url?, reward_currency:'usdc'|'token',
 *     token_mint?, total_pool_value, spins_pot }
 *   Sets this week's Co-Sign pool: a cash prize for callers of the #1 artist
 *   plus a Spins consolation pot. Defaults to the current Monday-UTC week.
 *   A settled week is left alone.
 */
function currentWeekStartUTC(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const off = day === 0 ? 6 : day - 1
  const ws = new Date(now)
  ws.setUTCDate(now.getUTCDate() - off)
  ws.setUTCHours(0, 0, 0, 0)
  return ws.toISOString().split("T")[0]
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const week = (typeof b.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.week_start)) ? b.week_start : currentWeekStartUTC()
  const currency = String(b.reward_currency || "usdc")
  if (!["usdc", "token"].includes(currency)) return NextResponse.json({ error: "reward_currency must be usdc or token." }, { status: 400 })
  const pool = Number(b.total_pool_value)
  const spins = Number(b.spins_pot ?? 0)
  if (!Number.isFinite(pool) || pool < 0) return NextResponse.json({ error: "total_pool_value invalid." }, { status: 400 })
  if (currency === "token" && !String(b.token_mint || "").trim()) return NextResponse.json({ error: "token_mint required for a token pool." }, { status: 400 })

  try {
    const supabase = await createAdminClient()
    const { data: existing } = await supabase.from("pit_cosign_pools").select("status").eq("week_start", week).maybeSingle()
    if (existing?.status === "settled") return NextResponse.json({ error: "That week is already settled." }, { status: 409 })

    const { error } = await supabase.from("pit_cosign_pools").upsert({
      week_start: week,
      sponsor_name: typeof b.sponsor_name === "string" ? b.sponsor_name.trim().slice(0, 120) : null,
      sponsor_url: typeof b.sponsor_url === "string" ? b.sponsor_url.trim().slice(0, 300) : null,
      reward_currency: currency,
      token_mint: currency === "token" ? String(b.token_mint).trim() : null,
      total_pool_value: pool,
      pool_spins: Number.isFinite(spins) && spins > 0 ? Math.round(spins) : 0,
      status: "set",
    }, { onConflict: "week_start" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, week_start: week })
  } catch (e: any) {
    console.error("[admin/cosign/pool]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
