import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { sendSplToken, confirmSig } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST { airdrop } → sends the partner token to every 'requested' allocation
 * of that drop, one transfer each, stamping each via airdrop_mark_sent.
 * Real on-chain sends from the payout wallet. Per-alloc results returned.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await request.json().catch(() => ({})) as { airdrop?: number }
  const id = Number(b.airdrop)
  if (!Number.isFinite(id)) return NextResponse.json({ error: "airdrop id required" }, { status: 400 })

  try {
    const supabase = await createAdminClient()
    const { data: drop } = await supabase.from("airdrops").select("token_mint, token_decimals").eq("id", id).maybeSingle()
    if (!drop) return NextResponse.json({ error: "drop not found" }, { status: 404 })

    const { data: rows } = await supabase
      .from("airdrop_allocations")
      .select("id, wallet_address, amount, status")
      .eq("airdrop_id", id).eq("status", "requested")

    const results: { id: number; ok: boolean; signature?: string; error?: string }[] = []
    for (const r of rows || []) {
      const wallet = (r as any).wallet_address as string | null
      const amount = Number((r as any).amount) || 0
      if (!wallet || amount <= 0) { results.push({ id: r.id, ok: false, error: "missing wallet or amount" }); continue }
      try {
        const { signature } = await sendSplToken(drop.token_mint, Number(drop.token_decimals) || 5, wallet, amount)
        await confirmSig(signature).catch(() => false)
        const { data: mark } = await supabase.rpc("airdrop_mark_sent", { p_alloc: r.id, p_sig: signature })
        results.push((mark as any)?.ok ? { id: r.id, ok: true, signature } : { id: r.id, ok: false, signature, error: "sent, not stamped" })
      } catch (e: any) {
        results.push({ id: r.id, ok: false, error: String(e?.message || e) })
      }
    }
    const sent = results.filter((x) => x.ok).length
    return NextResponse.json({ ok: true, sent, total: results.length, results })
  } catch (e: any) {
    console.error("[admin/airdrops/send]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
