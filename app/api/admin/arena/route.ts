import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Arena match admin.
 *
 * GET    → last 50 matches with their pool split + stake count.
 * POST   → create a head-to-head. Body:
 *          { artist_a, artist_b (roster slugs), mode:'daily'|'test',
 *            hours?, test_minutes?, min_stake?, max_stake?, per_user_cap? }
 *          Opens now; closes now + duration. Winner = more qualified streams
 *          in the window; the winning side splits the whole pool.
 * DELETE  → ?id=  removes a match ONLY if it has no stakes yet (safe cancel).
 *          A match that already has stakes must be settled, not deleted.
 */
const SLUG_NAMES: Record<string, string> = {
  "chartnobyl-bro": "Chartnobyl Bro", "coinalisa": "Coinalisa", "lola-likwidity": "Lola Likwidity",
  "mcbagholder": "McBagholder", "dj-dustwallet": "DJ Dustwallet", "shilliam-dafoe": "Shilliam Dafoe", "satosheek": "Satosheek",
}
const SLUGS = Object.keys(SLUG_NAMES)

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("pit_arena_matches")
      .select("*, pit_arena_picks(count)")
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const matches = (data || []).map((m: any) => ({
      ...m,
      name_a: SLUG_NAMES[m.artist_a] || m.artist_a,
      name_b: SLUG_NAMES[m.artist_b] || m.artist_b,
      pick_count: Array.isArray(m.pit_arena_picks) ? Number(m.pit_arena_picks[0]?.count || 0) : 0,
    }))
    return NextResponse.json({ matches, roster: SLUG_NAMES })
  } catch (e: any) {
    console.error("[admin/arena GET]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const a = String(b.artist_a || "")
  const c = String(b.artist_b || "")
  if (!SLUGS.includes(a) || !SLUGS.includes(c)) return NextResponse.json({ error: "Pick two valid artists." }, { status: 400 })
  if (a === c) return NextResponse.json({ error: "Pick two different artists." }, { status: 400 })

  const mode = b.mode === "test" ? "test" : "daily"
  let closesAt: Date
  if (mode === "test") {
    const mins = Math.max(1, Math.min(1440, Math.round(Number(b.test_minutes) || 5)))
    closesAt = new Date(Date.now() + mins * 60 * 1000)
  } else {
    const hours = Math.max(1, Math.min(168, Math.round(Number(b.hours) || 24)))
    closesAt = new Date(Date.now() + hours * 3600 * 1000)
  }
  const minStake = Math.max(1, Math.round(Number(b.min_stake) || 1))
  const maxRaw = Number(b.max_stake)
  const maxStake = Number.isFinite(maxRaw) && maxRaw >= minStake ? Math.round(maxRaw) : null
  const perUserCap = Math.max(1, Math.round(Number(b.per_user_cap) || 25))

  try {
    const supabase = await createAdminClient()
    const opensAt = new Date()
    const { data, error } = await supabase
      .from("pit_arena_matches")
      .insert({
        artist_a: a, artist_b: c,
        opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(),
        min_stake: minStake, max_stake: maxStake, per_user_cap: perUserCap,
        status: "set",
      })
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id, opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(), mode })
  } catch (e: any) {
    console.error("[admin/arena POST]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = Number(new URL(request.url).searchParams.get("id"))
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id required" }, { status: 400 })
  try {
    const supabase = await createAdminClient()
    const { count } = await supabase.from("pit_arena_picks").select("id", { count: "exact", head: true }).eq("match_id", id)
    if ((count || 0) === 0) {
      // no stakes → safe hard delete
      const { error } = await supabase.from("pit_arena_matches").delete().eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, deleted: id })
    }
    // has stakes → void + refund every locked stake (never force-settle a match being cancelled)
    const { data, error } = await supabase.rpc("pit_arena_void", { p_match: id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const r = (data || {}) as any
    if (!r.ok) return NextResponse.json({ error: r.reason === "already_settled" ? "That match is already settled — it can't be cancelled." : "Couldn't cancel that match." }, { status: 409 })
    return NextResponse.json({ ok: true, voided: true, refunded_count: r.refunded_count, refunded_total: r.refunded_total })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
