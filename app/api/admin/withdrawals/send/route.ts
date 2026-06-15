import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { sendUsdc } from "@/lib/solana-payout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/admin/withdrawals/send   body: { id, action? }
 *
 * "send": atomically claim a request (requested → sending), send the USDC, then
 * mark it sent with the tx signature, or failed with the real reason. The send
 * is wrapped in a hard timeout so the row can never be left stuck in "sending":
 * it always ends sent or failed, and a failure always writes a note.
 *
 * Stuck recovery: a row left in "sending" with no signature for over 3 minutes
 * (e.g. a killed request from the old code) is reclaimable, so a freeze can't
 * lock the funds forever.
 *
 * "reject": mark a requested/failed/stale-sending row rejected, freeing the
 * funds back to the player's withdrawable balance. Nothing is sent.
 */

const HARD_TIMEOUT_MS = 45000
const STUCK_MS = 3 * 60 * 1000

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
      .eq("id", id).in("status", ["requested", "failed", "sending"])
      .is("tx_signature", null)
      .select("id, amount_usdc").maybeSingle()
    if (!rej) return NextResponse.json({ error: "Not pending, can't reject." }, { status: 409 })
    await logAdminAction(supabase, request, session.username, "withdrawal_rejected", { id, amount: rej.amount_usdc })
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // Reclaim a row stuck in "sending" with no signature from a prior killed
  // request, so it can be retried. Newer stuck rows are left alone to avoid
  // racing a request that may still be in flight.
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
  if (!claimed) {
    return NextResponse.json({ error: "Already processing or not pending." }, { status: 409 })
  }

  try {
    const result = await Promise.race([
      sendUsdc(claimed.address, Number(claimed.amount_usdc)),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("send timed out — check the payout wallet on Solscan before retrying")), HARD_TIMEOUT_MS)),
    ])

    const note = result.confirmed ? null : "broadcast; confirmation pending — verify on Solscan"
    await supabase.from("pit_withdrawals").update({
      status: "sent", tx_signature: result.signature, note,
      processed_at: new Date().toISOString(), processed_by: session.username,
    }).eq("id", id)
    await logAdminAction(supabase, request, session.username, "withdrawal_sent", {
      id, amount: claimed.amount_usdc, to: claimed.address, from: result.from,
      signature: result.signature, confirmed: result.confirmed,
    })
    return NextResponse.json({ ok: true, status: "sent", signature: result.signature, confirmed: result.confirmed })
  } catch (e: any) {
    const msg = (e?.message || String(e)).slice(0, 300)
    await supabase.from("pit_withdrawals").update({
      status: "failed", note: msg,
      processed_at: new Date().toISOString(), processed_by: session.username,
    }).eq("id", id)
    await logAdminAction(supabase, request, session.username, "withdrawal_failed", { id, error: msg })
    return NextResponse.json({ error: `Send failed: ${msg}`, status: "failed" }, { status: 500 })
  }
}
