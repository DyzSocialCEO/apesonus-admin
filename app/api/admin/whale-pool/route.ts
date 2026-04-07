import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

interface WhalePoolConfig {
  weekly_amount: number
  active: boolean
  last_distributed: string | null
}

function startOfWeek(d = new Date()): string {
  // ISO Monday
  const dt = new Date(d)
  const day = dt.getUTCDay() || 7
  dt.setUTCHours(0, 0, 0, 0)
  if (day !== 1) dt.setUTCDate(dt.getUTCDate() - (day - 1))
  return dt.toISOString().slice(0, 10)
}

async function readConfig(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<WhalePoolConfig> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "whale_stars_pool")
    .maybeSingle()

  const fallback: WhalePoolConfig = { weekly_amount: 0, active: false, last_distributed: null }
  if (!data?.value) return fallback
  if (typeof data.value === "string") {
    try { return JSON.parse(data.value) as WhalePoolConfig } catch { return fallback }
  }
  return data.value as WhalePoolConfig
}

async function writeConfig(supabase: Awaited<ReturnType<typeof createAdminClient>>, config: WhalePoolConfig) {
  return supabase
    .from("app_settings")
    .upsert(
      { key: "whale_stars_pool", value: config as any, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const config = await readConfig(supabase)
    const currentWeek = startOfWeek()

    // Get all WHALEs
    const { data: whales } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, onus_balance, weekly_onus_earned, genesis_badge")
      .eq("verification_tier", "whale")
      .order("weekly_onus_earned", { ascending: false, nullsFirst: false })
      .limit(50)

    // Get this week's payouts
    const { data: thisWeekPayouts } = await supabase
      .from("whale_stars_payouts")
      .select("*")
      .eq("week_start", currentWeek)

    // Get historical totals
    const { data: history } = await supabase
      .from("whale_stars_payouts")
      .select("week_start, amount, status")
      .order("week_start", { ascending: false })
      .limit(100)

    return NextResponse.json({
      config,
      currentWeek,
      whales: whales || [],
      thisWeekPayouts: thisWeekPayouts || [],
      history: history || [],
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    // ── Set weekly pool amount ──────────────────────────
    if (action === "set_amount") {
      const amount = parseInt(body.amount)
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
      }
      const current = await readConfig(supabase)
      const next: WhalePoolConfig = { ...current, weekly_amount: amount, active: amount > 0 }
      const { error } = await writeConfig(supabase, next)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, config: next })
    }

    // ── Distribute pool to top whales by weekly $ONUS earned ──
    if (action === "distribute") {
      const topN = parseInt(body.topN) || 10
      const config = await readConfig(supabase)

      if (config.weekly_amount <= 0) {
        return NextResponse.json({ error: "Pool amount is zero. Set it first." }, { status: 400 })
      }

      const week = startOfWeek()

      // Get top whales by weekly onus earned
      const { data: topWhales } = await supabase
        .from("users")
        .select("telegram_id, username, first_name, weekly_onus_earned")
        .eq("verification_tier", "whale")
        .order("weekly_onus_earned", { ascending: false, nullsFirst: false })
        .limit(topN)

      if (!topWhales || topWhales.length === 0) {
        return NextResponse.json({ error: "No WHALEs found" }, { status: 400 })
      }

      // Pro-rata split by weekly_onus_earned. If all 0, equal split.
      const totalEarned = topWhales.reduce((s, w) => s + (w.weekly_onus_earned || 0), 0)
      const useEqual = totalEarned <= 0

      const allocations = topWhales.map((w, i) => {
        let amount: number
        if (useEqual) {
          amount = Math.floor(config.weekly_amount / topWhales.length)
        } else {
          amount = Math.floor(((w.weekly_onus_earned || 0) / totalEarned) * config.weekly_amount)
        }
        // Give the remainder to the top earner
        if (i === 0) {
          const allocated = useEqual
            ? Math.floor(config.weekly_amount / topWhales.length) * topWhales.length
            : topWhales.reduce((s, ww) => s + Math.floor(((ww.weekly_onus_earned || 0) / totalEarned) * config.weekly_amount), 0)
          amount += config.weekly_amount - allocated
        }
        return { telegram_id: w.telegram_id, amount, week_start: week, status: "pending" }
      }).filter(a => a.amount > 0)

      // Insert payouts (idempotent on (telegram_id, week_start))
      const { error } = await supabase
        .from("whale_stars_payouts")
        .upsert(allocations, { onConflict: "telegram_id,week_start" })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Update last_distributed timestamp
      await writeConfig(supabase, { ...config, last_distributed: new Date().toISOString() })

      return NextResponse.json({
        success: true,
        week,
        allocated: allocations.length,
        totalDistributed: allocations.reduce((s, a) => s + a.amount, 0),
      })
    }

    // ── Mark a payout as sent (admin manually sent the Stars) ──
    if (action === "mark_sent") {
      const { payoutId, notes } = body
      if (!payoutId) return NextResponse.json({ error: "payoutId required" }, { status: 400 })
      const { error } = await supabase
        .from("whale_stars_payouts")
        .update({ status: "sent", sent_at: new Date().toISOString(), notes: notes || null })
        .eq("id", payoutId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── Mark failed ──
    if (action === "mark_failed") {
      const { payoutId, notes } = body
      if (!payoutId) return NextResponse.json({ error: "payoutId required" }, { status: 400 })
      const { error } = await supabase
        .from("whale_stars_payouts")
        .update({ status: "failed", notes: notes || null })
        .eq("id", payoutId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── Delete a pending payout ──
    if (action === "delete_payout") {
      const { payoutId } = body
      if (!payoutId) return NextResponse.json({ error: "payoutId required" }, { status: 400 })
      const { error } = await supabase
        .from("whale_stars_payouts")
        .delete()
        .eq("id", payoutId)
        .eq("status", "pending")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
