import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET  /api/admin/payouts?status=pending_payout|paid
 *   The manual payout queue. Real-value rewards (usdc/token) that are owed to
 *   a wallet, or already paid. Each row: wallet, amount, currency, track, when.
 *   Spins rewards are 'credited' (already given) and don't appear here.
 *
 * POST /api/admin/payouts  { ids: number[], tx_signature }
 *   Mark a batch paid after you send from your wallet. Stamps tx_signature and
 *   paid_at, flips status to 'paid'. Only pending_payout rows are touched.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "pending_payout"
  if (!["pending_payout", "paid"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 })
  }

  try {
    const supabase = await createAdminClient()
    const { data: rows } = await supabase
      .from("pit_golden_tickets")
      .select("id, user_id, wallet_address, reward_currency, token_mint, value, track_id, tx_signature, won_at, paid_at")
      .eq("status", status)
      .order("won_at", { ascending: true })
      .limit(500)

    const ids = Array.from(new Set((rows || []).map((r: any) => r.track_id).filter(Boolean)))
    const tmap: Record<number, string> = {}
    if (ids.length) {
      const { data: t } = await supabase.from("tracks").select("id, title").in("id", ids)
      for (const x of t || []) tmap[x.id] = x.title
    }

    const claims = (rows || []).map((r: any) => ({
      id: r.id,
      wallet: r.wallet_address,
      currency: r.reward_currency,
      token_mint: r.token_mint,
      value: Number(r.value) || 0,
      track_title: tmap[r.track_id] || null,
      tx_signature: r.tx_signature,
      won_at: r.won_at,
      paid_at: r.paid_at,
      needs_wallet: !r.wallet_address,
    }))
    return NextResponse.json({ status, claims })
  } catch (e: any) {
    console.error("[admin/golden/claims GET]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as { ids?: unknown; tx_signature?: unknown }
  const ids = Array.isArray(b.ids) ? b.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : []
  const tx = typeof b.tx_signature === "string" ? b.tx_signature.trim().slice(0, 200) : ""
  if (ids.length === 0) return NextResponse.json({ error: "No claim ids." }, { status: 400 })
  if (!tx) return NextResponse.json({ error: "tx_signature is required to mark paid." }, { status: 400 })

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("pit_golden_tickets")
      .update({ status: "paid", tx_signature: tx, paid_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "pending_payout")
      .select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, paid: (data || []).length })
  } catch (e: any) {
    console.error("[admin/golden/claims POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
