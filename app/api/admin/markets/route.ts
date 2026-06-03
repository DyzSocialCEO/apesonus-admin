import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ============================================================================
// /api/admin/markets — create / list / lock / settle / void
//
// Settlement reads play_history (timestamped raw plays) over the market window
// [opens_at, settles_at] — works for any timeframe. The metric + result are
// computed here; the atomic token movement happens in the SQL RPCs.
// ============================================================================

type Track = { id: number; title: string; artist: string; mood: string }

// Count plays per track id within [from, to] (UTC ISO strings).
async function countPlays(supabase: any, from: string, to: string): Promise<Record<number, number>> {
  const counts: Record<number, number> = {}
  // page through play_history in the window
  let offset = 0
  const page = 1000
  for (;;) {
    const { data, error } = await supabase
      .from("play_history")
      .select("track_id")
      .gte("played_at", from)
      .lte("played_at", to)
      .range(offset, offset + page - 1)
    if (error || !data || data.length === 0) break
    for (const r of data) counts[r.track_id] = (counts[r.track_id] || 0) + 1
    if (data.length < page) break
    offset += page
  }
  return counts
}

// Given a market + the play counts + track metadata, decide 'back' or 'fade'.
function decideResult(
  market: any,
  counts: Record<number, number>,
  tracks: Track[]
): { result: "back" | "fade"; detail: Record<string, unknown> } {
  const byId = new Map(tracks.map((t) => [String(t.id), t]))
  const sumWhere = (pred: (t: Track) => boolean) =>
    tracks.reduce((acc, t) => (pred(t) ? acc + (counts[t.id] || 0) : acc), 0)

  if (market.type === "song") {
    const a = counts[Number(market.subject_a)] || 0
    const back = a >= market.threshold
    return { result: back ? "back" : "fade", detail: { subject_a: a, threshold: market.threshold } }
  }

  if (market.type === "head") {
    const a = counts[Number(market.subject_a)] || 0
    const b = counts[Number(market.subject_b)] || 0
    const back = a - b >= market.threshold
    return { result: back ? "back" : "fade", detail: { a, b, diff: a - b, threshold: market.threshold } }
  }

  if (market.type === "artist") {
    const a = sumWhere((t) => t.artist === market.subject_a)
    if (market.subject_b) {
      const b = sumWhere((t) => t.artist === market.subject_b)
      return { result: a - b >= market.threshold ? "back" : "fade", detail: { a, b, diff: a - b } }
    }
    return { result: a >= market.threshold ? "back" : "fade", detail: { a, threshold: market.threshold } }
  }

  // mood: "back" if subject_a mood is dominant (or hits threshold when set)
  const moods = ["moon", "rekt", "cope", "degen", "zen"]
  const totals: Record<string, number> = {}
  for (const m of moods) totals[m] = sumWhere((t) => t.mood === m)
  const target = totals[market.subject_a] || 0
  if (market.threshold > 0) {
    return { result: target >= market.threshold ? "back" : "fade", detail: { totals } }
  }
  const dominant = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { result: dominant === market.subject_a ? "back" : "fade", detail: { totals, dominant } }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()

    const { data: markets } = await supabase
      .from("markets").select("*").order("created_at", { ascending: false }).limit(200)

    const { data: positions } = await supabase
      .from("market_positions").select("market_id, side, stake, status")

    const { data: tracks } = await supabase
      .from("tracks").select("id, title, artist, mood").eq("is_active", true).order("title")

    const { data: ledger } = await supabase
      .from("onus_ledger").select("*").eq("id", 1).maybeSingle()

    // tally positions per market
    const agg: Record<string, { back: number; fade: number; backStake: number; fadeStake: number; n: number }> = {}
    for (const p of positions || []) {
      const a = (agg[p.market_id] ||= { back: 0, fade: 0, backStake: 0, fadeStake: 0, n: 0 })
      if (p.side === "back") { a.back++; a.backStake += Number(p.stake) }
      else { a.fade++; a.fadeStake += Number(p.stake) }
      a.n++
    }

    return NextResponse.json({ markets: markets || [], positions: agg, tracks: tracks || [], ledger })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()
    const body = await request.json()
    const action = body.action

    // ── create ──
    if (action === "create") {
      const { type, question, subject_a, subject_b, threshold, locks_at, settles_at, emissions_pool } = body
      if (!type || !question || !subject_a || !locks_at || !settles_at) {
        return NextResponse.json({ error: "missing fields" }, { status: 400 })
      }
      const { data, error } = await supabase.from("markets").insert({
        type,
        question,
        subject_a: String(subject_a),
        subject_b: subject_b ? String(subject_b) : null,
        threshold: Number(threshold) || 0,
        locks_at,
        settles_at,
        emissions_pool: Number(emissions_pool) || 0,
        created_by: null,
        status: "open",
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ created: true, market: data })
    }

    const marketId = body.market_id
    if (!marketId) return NextResponse.json({ error: "market_id required" }, { status: 400 })

    // ── lock ──
    if (action === "lock") {
      const { data, error } = await supabase.rpc("lock_market", { p_market_id: marketId })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // ── void ──
    if (action === "void") {
      const { data, error } = await supabase.rpc("void_market", { p_market_id: marketId })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // ── settle ── (compute metric, then atomic payout)
    if (action === "settle") {
      const { data: market } = await supabase.from("markets").select("*").eq("id", marketId).single()
      if (!market) return NextResponse.json({ error: "market not found" }, { status: 404 })
      if (!["open", "locked"].includes(market.status)) {
        return NextResponse.json({ error: `not settleable (${market.status})` }, { status: 400 })
      }

      // allow an admin override result, else compute from plays
      let result = body.result as "back" | "fade" | undefined
      let detail: Record<string, unknown> = { override: !!result }
      if (!result) {
        const { data: tracks } = await supabase.from("tracks").select("id, title, artist, mood")
        const counts = await countPlays(supabase, market.opens_at, market.settles_at)
        const decided = decideResult(market, counts, (tracks || []) as Track[])
        result = decided.result
        detail = decided.detail
      }

      const { data, error } = await supabase.rpc("settle_market_with_result", {
        p_market_id: marketId,
        p_result: result,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ...data, detail })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
