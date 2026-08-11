import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE AIRDROP desk.
 *
 * GET   the running window with its list: while OPEN the list is the live
 *       standings (recomputed on every read, it moves as patients earn);
 *       once LOCKED it is the frozen shares, the list to check before
 *       anything moves.
 * POST  { what: "open",      pot, closes_at }
 *       { what: "lock",      window_id }
 *       { what: "mark_paid", window_id, user_id, tx }
 *       { what: "finish",    window_id, force? }
 *
 * The desk never sends money. Every payment is made by hand from the
 * treasury; MARK PAID only records that it happened and which tx did it.
 * All maths lives in the 109 SQL functions so the desk and the app can
 * never disagree about a share.
 */

type ScoreRow = {
  user_id: string
  doses: number
  days: number
  treatments: number
  spins: number
  certs: number
  score: number
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: w } = await supabase
      .from("airdrop_windows")
      .select("id, pot, symbol, opens_at, closes_at, status, locked_at")
      .neq("status", "done")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: past } = await supabase
      .from("airdrop_windows")
      .select("id, pot, symbol, opens_at, closes_at, locked_at")
      .eq("status", "done")
      .order("id", { ascending: false })
      .limit(10)

    if (!w) return NextResponse.json({ window: null, list: [], past: past ?? [] })

    if (w.status === "locked") {
      const { data: shares } = await supabase
        .from("airdrop_shares")
        .select("user_id, number, score, pays, wallet, paid_at, tx")
        .eq("window_id", w.id)
        .order("score", { ascending: false })
      return NextResponse.json({ window: w, list: shares ?? [], past: past ?? [] })
    }

    // OPEN: live standings. Scores from the window's own range, capped at
    // now; the number and the latest proven wallet joined here so the desk
    // sees exactly what a lock would freeze.
    const to = new Date(Math.min(Date.now(), new Date(w.closes_at).getTime())).toISOString()
    const { data: scores } = await supabase.rpc("airdrop_scores", {
      p_from: w.opens_at,
      p_to: to,
    })
    const rows = ((scores ?? []) as ScoreRow[]).filter((r) => r.score > 0)
    rows.sort((a, b) => b.score - a.score)

    const ids = rows.map((r) => r.user_id)
    const [{ data: patients }, { data: wallets }] = await Promise.all([
      ids.length
        ? supabase.from("ward_patients").select("user_id, number").in("user_id", ids)
        : Promise.resolve({ data: [] } as any),
      ids.length
        ? supabase
            .from("ward_autopsy")
            .select("user_id, wallet, created_at")
            .in("user_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] } as any),
    ])
    const numberOf = new Map<string, number>(
      (patients ?? []).map((p: any) => [String(p.user_id), Number(p.number)]),
    )
    // First row per user is the latest, thanks to the order above.
    const walletOf = new Map<string, string>()
    for (const r of wallets ?? []) {
      const u = String((r as any).user_id)
      if (!walletOf.has(u)) walletOf.set(u, String((r as any).wallet))
    }

    const total = rows.reduce((a, r) => a + r.score, 0)
    const list = rows.map((r) => ({
      user_id: r.user_id,
      number: numberOf.get(r.user_id) ?? null,
      score: r.score,
      doses: r.doses,
      days: r.days,
      treatments: r.treatments,
      spins: r.spins,
      certs: r.certs,
      wallet: walletOf.get(r.user_id) ?? null,
      // An estimate the same way the SQL will do it, floor at 6 decimals.
      pays:
        total > 0 && walletOf.has(r.user_id)
          ? Math.floor((Number(w.pot) * r.score * 1e6) / total) / 1e6
          : null,
    }))

    return NextResponse.json({ window: w, list, past: past ?? [] })
  } catch (e: any) {
    console.error("[admin/airdrop] GET:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const what = String(body?.what || "")
    const supabase = await createAdminClient()

    if (what === "open") {
      const pot = Number(body?.pot)
      const closes = String(body?.closes_at || "")
      const { data, error } = await supabase.rpc("airdrop_open", {
        p_pot: pot,
        p_closes_at: closes,
      })
      if (error) throw error
      return NextResponse.json(data)
    }

    if (what === "lock") {
      const { data, error } = await supabase.rpc("airdrop_lock", {
        p_window: Number(body?.window_id),
      })
      if (error) throw error
      return NextResponse.json(data)
    }

    if (what === "mark_paid") {
      const { data, error } = await supabase.rpc("airdrop_mark_paid", {
        p_window: Number(body?.window_id),
        p_user: String(body?.user_id || ""),
        p_tx: String(body?.tx || ""),
      })
      if (error) throw error
      return NextResponse.json(data)
    }

    if (what === "finish") {
      const { data, error } = await supabase.rpc("airdrop_finish", {
        p_window: Number(body?.window_id),
        p_force: body?.force === true,
      })
      if (error) throw error
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/airdrop] POST:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
