import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { sendUsdc, confirmSig } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/admin/withdrawals/send   body: { id, action? }
 *
 * "send": claim the request (requested → sending), submit the USDC transfer,
 * and write the signature the instant it broadcasts, marking the row sent
 * before confirmation. Every network call is time-boxed, so the row can never
 * stay stuck in "sending": it ends sent (with a tx link) or failed (with the
 * real reason). Confirmation is then refined best-effort into the note.
 *
 * Stuck recovery: a row left "sending" with no signature for over 2 minutes is
 * reclaimable on the next click.
 *
 * "reject": mark a requested/failed/stale-sending row rejected, freeing the
 * funds back to the player. Nothing is sent.
 */

const STUCK_MS = 2 * 60 * 1000

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
      .eq("id", id).in("status", ["requested", "failed", "sending"]).is("tx_signature", null)
      .select("id, amount_usdc").maybeSingle()
    if (!rej) return NextResponse.json({ error: "Not pending, can't reject." }, { status: 409 })
    await logAdminAction(supabase, request, session.username, "withdrawal_rejected", { id, amount: rej.amount_usdc })
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // Reclaim a row stuck "sending" with no signature from an earlier killed
  // request, so it can be retried.
  await supabase
    .from("pit_withdrawals")
    .update({ status: "requested" })
    .eq("id", id).eq("status", "sending").is("tx_signature", null)
    .lt("requested_at", new Date(Date.now() - STUCK_MS).toISOString())

  // Atomic claim: only one sender can move requested → sending.
  const { data: claimed } = await supabase
    .from("pit_withdrawals")
    .update({ status: "sending", processed_at: null, note: null })
    .eq("id", id).eq("status", "requested")
    .select("id, address, amount_usdc").maybeSingle()
  if (!claimed) return NextResponse.json({ error: "Already processing or not pending." }, { status: 409 })

  let signature: string
  let from: string
  try {
    const r = await sendUsdc(claimed.address, Number(claimed.amount_usdc))
    signature = r.signature
    from = r.from
  } catch (e: any) {
    const msg = (e?.message || String(e)).slice(0, 300)
    await supabase.from("pit_withdrawals").update({
      status: "failed", note: msg,
      processed_at: new Date().toISOString(), processed_by: session.username,
    }).eq("id", id)
    await logAdminAction(supabase, request, session.username, "withdrawal_failed", { id, error: msg })
    return NextResponse.json({ error: `Send failed: ${msg}`, status: "failed" }, { status: 500 })
  }

  // Broadcast succeeded. Record the signature NOW, before confirming, so it can
  // never be lost even if the rest of the request is cut off.
  await supabase.from("pit_withdrawals").update({
    status: "sent", tx_signature: signature, note: "broadcast; confirming",
    processed_at: new Date().toISOString(), processed_by: session.username,
  }).eq("id", id)
  await logAdminAction(supabase, request, session.username, "withdrawal_sent", {
    id, amount: claimed.amount_usdc, to: claimed.address, from, signature,
  })

  const confirmed = await confirmSig(signature)
  await supabase.from("pit_withdrawals").update({
    note: confirmed ? null : "broadcast; confirmation pending — verify on Solscan",
  }).eq("id", id)

  return NextResponse.json({ ok: true, status: "sent", signature, confirmed })
}
