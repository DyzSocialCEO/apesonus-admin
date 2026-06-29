import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/distribution/payout  { partner_id, amount_usd, tx_signature?, note? }
 * Records a USDC payout to a partner (manual). Caps at the partner's owed
 * balance so you can't over-pay. Auto mode will write rows the same way.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const partnerId = Number(body.partner_id)
  const amountCents = Math.round(Number(body.amount_usd) * 100)
  const tx = String(body.tx_signature ?? "").trim() || null
  const note = String(body.note ?? "").trim() || null
  if (!Number.isFinite(partnerId)) return NextResponse.json({ error: "partner_id required" }, { status: 400 })
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter an amount greater than 0" }, { status: 400 })

  const supabase = await createAdminClient()
  const { data: partner } = await supabase.from("pit_partners").select("id").eq("id", partnerId).maybeSingle()
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 })

  const [{ data: acc }, { data: pd }] = await Promise.all([
    supabase.from("pit_partner_accruals").select("amount_cents").eq("partner_id", partnerId),
    supabase.from("pit_partner_payouts").select("amount_cents").eq("partner_id", partnerId).eq("status", "paid"),
  ])
  const accrued = (acc ?? []).reduce((a, r: { amount_cents: number }) => a + Number(r.amount_cents), 0)
  const paid = (pd ?? []).reduce((a, r: { amount_cents: number }) => a + Number(r.amount_cents), 0)
  const owed = accrued - paid
  if (amountCents > owed) return NextResponse.json({ error: `Amount exceeds owed ($${(owed / 100).toFixed(2)})` }, { status: 400 })

  const { error } = await supabase.from("pit_partner_payouts")
    .insert({ partner_id: partnerId, amount_cents: amountCents, tx_signature: tx, method: "manual", status: "paid", note })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
