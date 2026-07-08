import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/cosign/pool
 *   Open a backing round. Body:
 *   { sponsor_name?, sponsor_url?, pool_spins, round_mode:'weekly'|'test',
 *     test_minutes?, live_url? }
 *
 *   Prize = a FIXED SPINS POOL (pool_spins) — everyone who backs the winning
 *   artist splits it by lock-in time. round_mode 'weekly' → the real round:
 *   Sunday 00:00 UTC → Saturday 23:59 UTC. 'test' → a short round starting now
 *   for test_minutes (e.g. 5), so the whole loop can be watched fast with real
 *   code. The round is keyed by its opening date; a settled round is never
 *   overwritten.
 *
 * DELETE /api/admin/cosign/pool?week=YYYY-MM-DD&calls=1  — operator reset.
 */
function sundayUTC(): Date {
  const now = new Date()
  const daysSinceSun = now.getUTCDay() // Sun=0, Mon=1 ...
  const sun = new Date(now)
  sun.setUTCDate(now.getUTCDate() - daysSinceSun)
  sun.setUTCHours(0, 0, 0, 0)
  return sun
}
const dateKey = (d: Date) => d.toISOString().split("T")[0]

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const poolSpins = Math.round(Number(b.pool_spins))
  if (!Number.isFinite(poolSpins) || poolSpins < 0) return NextResponse.json({ error: "pool_spins invalid." }, { status: 400 })

  const mode = b.round_mode === "test" ? "test" : "weekly"
  let opensAt: Date, closesAt: Date, weekKey: string
  if (mode === "test") {
    const mins = Math.max(1, Math.min(1440, Math.round(Number(b.test_minutes) || 5)))
    opensAt = new Date()
    closesAt = new Date(Date.now() + mins * 60 * 1000)
    weekKey = dateKey(opensAt) // provisional; made unique below
  } else {
    opensAt = sundayUTC()
    closesAt = new Date(opensAt.getTime() + 7 * 86400000 - 60000) // next Sun 00:00 minus 1 min = Sat 23:59
    weekKey = dateKey(opensAt)
  }

  try {
    const supabase = await createAdminClient()

    // For TEST rounds, pick the next free date key so a new test round never
    // collides with a settled/older one (which would otherwise 409). Weekly
    // rounds keep their true Saturday key (one weekly round per week).
    if (mode === "test") {
      const { data: latest } = await supabase.from("pit_cosign_pools").select("week_start").order("week_start", { ascending: false }).limit(1).maybeSingle()
      const today = new Date(); today.setUTCHours(0, 0, 0, 0)
      let keyDate = today
      if (latest?.week_start) {
        const maxD = new Date(latest.week_start + "T00:00:00Z")
        if (maxD >= today) keyDate = new Date(maxD.getTime() + 86400000)
      }
      weekKey = dateKey(keyDate)
    }

    const { data: existing } = await supabase.from("pit_cosign_pools").select("status").eq("week_start", weekKey).maybeSingle()
    if (existing?.status === "settled") return NextResponse.json({ error: "That round is already settled. Start a new one." }, { status: 409 })

    const { error } = await supabase.from("pit_cosign_pools").upsert({
      week_start: weekKey,
      sponsor_name: typeof b.sponsor_name === "string" ? b.sponsor_name.trim().slice(0, 120) : null,
      sponsor_url: typeof b.sponsor_url === "string" ? b.sponsor_url.trim().slice(0, 300) : null,
      reward_currency: "spins",
      token_mint: null,
      total_pool_value: poolSpins,   // mirrored so every legacy display shows "N Spins"
      live_url: typeof b.live_url === "string" ? b.live_url.trim().slice(0, 400) : null,
      pool_spins: poolSpins,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      status: "set",
    }, { onConflict: "week_start" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, week_start: weekKey, opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(), mode })
  } catch (e: any) {
    console.error("[admin/cosign/pool]", e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(request.url)
  const week = url.searchParams.get("week")
  const alsoCalls = url.searchParams.get("calls") === "1"
  try {
    const supabase = await createAdminClient()
    // default: the latest non-settled round
    let target = week
    if (!target) {
      const { data } = await supabase.from("pit_cosign_pools").select("week_start").eq("status", "set").order("closes_at", { ascending: false }).limit(1).maybeSingle()
      target = data?.week_start || null
    }
    if (!target) return NextResponse.json({ ok: true, note: "no active round" })
    let callsRemoved = 0
    if (alsoCalls) {
      const { data } = await supabase.from("pit_cosigns").delete().eq("week_start", target).select("id")
      callsRemoved = (data || []).length
    }
    const { error } = await supabase.from("pit_cosign_pools").delete().eq("week_start", target)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, week: target, calls_removed: callsRemoved })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
