import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { sendUsdc } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/withdrawals/send   body: { id, action? }
 *
 * action "send" (default): claim the request atomically (requested → sending),
 * send the USDC on-chain, then mark it sent with the tx signature. The atomic
 * claim guarantees a request can only be sent once even on a double click. On
 * failure it's marked failed (funds stay locked) for manual review.
 *
 * action "reject": mark a requested/failed row rejected, which frees the funds
 * back to the player's withdrawable balance. Nothing is sent.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any = {}
  try { body = await request.json() } catch {}
  const id = Number(body.id)
  const action = String(body.action || "send")
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const supabase = await createAdminClient()

  if (action === "reject") {
    const { data: rej } = await supabase
      .from("pit_withdrawals")
      .update({ status: "rejected", processed_at: new Date().toISOString(), processed_by: session.username })
      .eq("id", id).in("status", ["requested", "failed"]).select("id, amount_usdc, user_id").maybeSingle()
    if (!rej) return NextResponse.json({ error: "Not pending, can't reject." }, { status: 409 })
    await logAdminAction(supabase, request, session.username, "withdrawal_rejected", { id, amount: rej.amount_usdc })
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // Atomic claim: only one sender can move requested → sending.
  const { data: claimed } = await supabase
    .from("pit_withdrawals")
    .update({ status: "sending" })
    .eq("id", id).eq("status", "requested")
    .select("id, address, amount_usdc, user_id").maybeSingle()
  if (!claimed) {
    return NextResponse.json({ error: "Already processing or not pending." }, { status: 409 })
  }

  try {
    const { signature, from } = await sendUsdc(claimed.address, Number(claimed.amount_usdc))
    await supabase.from("pit_withdrawals").update({
      status: "sent", tx_signature: signature,
      processed_at: new Date().toISOString(), processed_by: session.username,
    }).eq("id", id)
    await logAdminAction(supabase, request, session.username, "withdrawal_sent", {
      id, amount: claimed.amount_usdc, to: claimed.address, from, signature,
    })
    return NextResponse.json({ ok: true, status: "sent", signature })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await supabase.from("pit_withdrawals").update({
      status: "failed", note: msg.slice(0, 300),
      processed_at: new Date().toISOString(), processed_by: session.username,
    }).eq("id", id)
    await logAdminAction(supabase, request, session.username, "withdrawal_failed", { id, error: msg.slice(0, 300) })
    return NextResponse.json({ error: `Send failed: ${msg}`, status: "failed" }, { status: 500 })
  }
}
