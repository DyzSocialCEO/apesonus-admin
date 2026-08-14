import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * WARD CALLS desk.
 *
 * GET   recent calls with answer counts.
 * POST  { what: "create",   ...call fields }
 *       { what: "void",     call_id, reason }
 *       { what: "override", call_id, result | no_decision, reason }
 *
 * Settlement is the cron's job against real market data. The desk creates
 * calls and, only with a written reason, overrides or voids them; the
 * operator and the reason are stored on the row forever.
 */

type Option = { label: string; mint?: string | null }

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  const { data: calls, error } = await supabase
    .from("ward_calls")
    .select("id, asset, pair, call_type, question, options, mint, target, reference_price, opens_at, locks_at, settles_at, status, result, no_decision, settled_at, override_by, override_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (calls || []).map((c) => c.id)
  const counts: Record<number, number> = {}
  if (ids.length) {
    const { data: rows } = await supabase.from("ward_call_answers").select("call_id").in("call_id", ids)
    for (const r of rows || []) counts[r.call_id] = (counts[r.call_id] || 0) + 1
  }
  return NextResponse.json({ calls: calls || [], counts })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const what = String(body.what || "")

  if (what === "create") {
    const callType = String(body.call_type || "")
    const asset = String(body.asset || "").trim()
    const question = String(body.question || "").trim()
    const opensAt = String(body.opens_at || "")
    const locksAt = String(body.locks_at || "")
    const settlesAt = String(body.settles_at || "")
    if (!asset || !question || !opensAt || !locksAt || !settlesAt) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }
    if (!(new Date(opensAt) < new Date(locksAt)) || !(new Date(locksAt) <= new Date(settlesAt))) {
      return NextResponse.json({ error: "Times must run opens < locks <= settles" }, { status: 400 })
    }

    let options: Option[] = []
    let mint: string | null = null
    let target: number | null = null

    if (callType === "above_below") {
      mint = String(body.mint || "").trim() || null
      target = Number(body.target)
      if (!mint || !Number.isFinite(target) || target <= 0) {
        return NextResponse.json({ error: "Above/below needs a mint and a target" }, { status: 400 })
      }
      options = [{ label: `ABOVE $${target}` }, { label: `BELOW $${target}` }]
    } else if (callType === "best_performer") {
      const raw = Array.isArray(body.options) ? (body.options as Option[]) : []
      options = raw
        .map((o) => ({ label: String(o?.label || "").trim(), mint: String(o?.mint || "").trim() }))
        .filter((o) => o.label && o.mint)
      if (options.length < 2 || options.length > 3) {
        return NextResponse.json({ error: "Best performer needs 2 or 3 options with mints" }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: "That call type is not live yet" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ward_calls")
      .insert({
        asset,
        pair: String(body.pair || "").trim() || null,
        call_type: callType,
        question,
        options,
        mint,
        target,
        reference_price: Number(body.reference_price) > 0 ? Number(body.reference_price) : null,
        opens_at: new Date(opensAt).toISOString(),
        locks_at: new Date(locksAt).toISOString(),
        settles_at: new Date(settlesAt).toISOString(),
      })
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  if (what === "void" || what === "override") {
    const callId = Number(body.call_id)
    const reason = String(body.reason || "").trim()
    if (!Number.isInteger(callId) || !reason) {
      return NextResponse.json({ error: "A written reason is required" }, { status: 400 })
    }
    const operator = session.username || "admin"
    if (what === "void") {
      const { data, error } = await supabase.rpc("ward_call_void", {
        p_call: callId,
        p_operator: operator,
        p_reason: reason,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }
    const noDecision = Boolean(body.no_decision)
    const result = noDecision ? null : Number(body.result)
    if (!noDecision && !Number.isInteger(result)) {
      return NextResponse.json({ error: "Pick a winner or no decision" }, { status: 400 })
    }
    const { data, error } = await supabase.rpc("ward_call_override", {
      p_call: callId,
      p_result: noDecision ? null : result,
      p_no_decision: noDecision,
      p_operator: operator,
      p_reason: reason,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
