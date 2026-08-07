import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/ammo/ledger?q=<email|wallet|name|user id>&reason=<reason>
 *
 * Every movement on one patient's balance, read off fin_spins_ledger, which
 * is a VIEW over the tables that actually move Spins. The patient sees this
 * same list on the Till, so when somebody asks where their Spins went, the
 * desk is looking at the row they are looking at rather than a second copy
 * of it that could disagree.
 *
 * One patient at a time on purpose. A ward-wide feed is a report, and the
 * question this answers is always about one person.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(request.url)
    const q = String(url.searchParams.get("q") || "").trim()
    const reason = String(url.searchParams.get("reason") || "").trim()
    if (!q) return NextResponse.json({ error: "Search for a patient first" }, { status: 400 })

    // Cookieless service client: the cookie-bound one can downgrade off
    // service_role and render every figure as a silent zero.
    const supabase = createServiceClient()

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
    type Who = { id: string; email: string | null; display_name: string | null; wallet_address: string | null }
    let userId: string | null = isUuid ? q : null
    let who: Who | null = null

    if (!userId) {
      const like = `%${q}%`
      const { data: found } = await supabase
        .from("users")
        .select("id, email, display_name, wallet_address")
        .or(`email.ilike.${like},display_name.ilike.${like},wallet_address.ilike.${like}`)
        .limit(2)
      if (!found?.length) return NextResponse.json({ error: "No patient matches that" }, { status: 404 })
      if (found.length > 1) {
        return NextResponse.json({ error: "More than one patient matches. Be more specific." }, { status: 409 })
      }
      userId = String(found[0].id)
      who = found[0] as Who
    } else {
      const { data: row } = await supabase
        .from("users")
        .select("id, email, display_name, wallet_address")
        .eq("id", userId)
        .maybeSingle()
      who = (row as Who | null) ?? null
    }

    let query = supabase
      .from("fin_spins_ledger")
      .select("ts, delta, reason, ref_table, ref_id")
      .eq("user_id", userId)
      .order("ts", { ascending: false })
      .limit(500)
    if (reason) query = query.eq("reason", reason)

    const [{ data: rows }, { data: balanceRow }] = await Promise.all([
      query,
      supabase.from("pit_ammo_balances").select("balance").eq("user_id", userId).maybeSingle(),
    ])

    // Totals are the WHOLE ledger for this patient, never the filtered view,
    // so a reason filter can never make the sum look wrong.
    const { data: allRows } = await supabase
      .from("fin_spins_ledger")
      .select("delta")
      .eq("user_id", userId)
      .limit(5000)

    let inSpins = 0
    let outSpins = 0
    for (const r of (allRows || []) as { delta: number }[]) {
      const d = Number(r.delta || 0)
      if (d >= 0) inSpins += d
      else outSpins += -d
    }
    const balance = Number(balanceRow?.balance || 0)

    return NextResponse.json({
      user: {
        id: userId,
        email: who?.email ?? null,
        display_name: who?.display_name ?? null,
        wallet_address: who?.wallet_address ?? null,
      },
      inSpins,
      outSpins,
      balance,
      drift: inSpins - outSpins - balance,
      movements: (rows || []).map((r: any) => ({
        ts: String(r.ts),
        delta: Number(r.delta || 0),
        reason: String(r.reason || ""),
        ref_table: r.ref_table ? String(r.ref_table) : null,
        ref_id: r.ref_id ? String(r.ref_id) : null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ledger read failed" }, { status: 500 })
  }
}
