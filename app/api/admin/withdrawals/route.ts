import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { payoutWalletAddress } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/withdrawals
 * The withdraw queue: pending requests to send, plus recent processed ones.
 * Also returns the payout wallet address so the operator can fund/track it.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createAdminClient()
  const { data } = await supabase
    .from("pit_withdrawals")
    .select("id, user_id, address, amount_usdc, status, tx_signature, note, requested_at, processed_at, processed_by")
    .order("requested_at", { ascending: false })
    .limit(200)

  const rows = (data || []).map((r: any) => ({
    id: r.id, user_id: r.user_id, address: r.address,
    amount: Number(r.amount_usdc) || 0, status: r.status,
    tx_signature: r.tx_signature, note: r.note,
    requested_at: r.requested_at, processed_at: r.processed_at, processed_by: r.processed_by,
  }))
  const pendingTotal = rows.filter((r) => r.status === "requested").reduce((s, r) => s + r.amount, 0)

  return NextResponse.json({
    withdrawals: rows,
    pending_total: Math.round(pendingTotal * 1e6) / 1e6,
    payout_wallet: payoutWalletAddress(),
  })
}
