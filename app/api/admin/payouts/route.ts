import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { sendUsdc, confirmSig, payoutWalletAddress } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * The Conviction payout queue.
 *
 * GET  ?status=requested|sent
 *   requested = winners who claimed and gave a wallet, waiting to be paid.
 *   sent      = paid, with the on-chain signature.
 *
 * POST { ids: number[] }
 *   Sends real USDC from the payout wallet to each claim's wallet, ONE tx per
 *   claim, then stamps that row sent via pit_cash_mark_sent. Returns a
 *   per-id result. No manual signature paste — the server sends and records.
 *   Errors on any single claim don't abort the batch; that claim stays
 *   'requested' and is reported failed.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "requested"
  if (!["requested", "sent"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 })
  }

  try {
    const supabase = await createAdminClient()
    const { data: rows } = await supabase
      .from("pit_cash_ledger")
      .select("id, user_id, usd_cents, wallet_address, status, tx_signature, created_at, sent_at")
      .eq("kind", "withdrawal")
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(500)

    // usd_cents is negative on a withdrawal row (it debits the balance).
    // The amount to send is its size.
    const claims = (rows || []).map((r: any) => ({
      id: r.id,
      contest_id: null,
      wallet: r.wallet_address,
      value: Math.abs(Number(r.usd_cents) || 0) / 100,
      currency: "usdc",
      tx_signature: r.tx_signature,
      when: r.sent_at || r.created_at,
      needs_wallet: !r.wallet_address,
    }))

    return NextResponse.json({
      status,
      claims,
      payout_wallet: payoutWalletAddress(),
    })
  } catch (e: any) {
    console.error("[admin/payouts GET]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as { ids?: unknown }
  const ids = Array.isArray(b.ids) ? b.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : []
  if (ids.length === 0) return NextResponse.json({ error: "No claim ids." }, { status: 400 })

  try {
    const supabase = await createAdminClient()

    // Re-read the claims fresh; only pay ones still 'requested' with a wallet.
    const { data: rows } = await supabase
      .from("pit_cash_ledger")
      .select("id, user_id, usd_cents, wallet_address, status")
      .in("id", ids)
      .eq("kind", "withdrawal")
      .eq("status", "requested")

    const results: { id: number; ok: boolean; signature?: string; error?: string }[] = []

    for (const r of rows || []) {
      const wallet = (r as any).wallet_address as string | null
      const amount = Math.abs(Number((r as any).usd_cents) || 0) / 100
      if (!wallet || amount <= 0) {
        results.push({ id: r.id, ok: false, error: "missing wallet or amount" })
        continue
      }
      try {
        const { signature } = await sendUsdc(wallet, amount)
        // Best-effort confirm; even if confirmation lags, the sig is recorded.
        await confirmSig(signature).catch(() => false)
        const { data: mark } = await supabase.rpc("pit_cash_mark_sent", {
          p_id: r.id, p_signature: signature,
        })
        if ((mark as any)?.ok) results.push({ id: r.id, ok: true, signature })
        else results.push({ id: r.id, ok: false, signature, error: "sent but not stamped — check tx" })
      } catch (e: any) {
        results.push({ id: r.id, ok: false, error: String(e?.message || e) })
      }
    }

    const sent = results.filter((x) => x.ok).length
    return NextResponse.json({ ok: true, sent, total: results.length, results })
  } catch (e: any) {
    console.error("[admin/payouts POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
