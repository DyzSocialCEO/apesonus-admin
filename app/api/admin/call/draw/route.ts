import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE DRAW, admin side.
 *
 * GET    /api/admin/call/draw          days, knobs, today's forming pool
 * PATCH  /api/admin/call/draw          { action:'knobs', draw_enabled?, draw_pool_pct? }
 *                                      { action:'settle', day, seed }
 *
 * The nightly cron settles automatically with a fresh blockhash seed.
 * Manual settle here is the override for a missed night or a dry run;
 * same function, same proof, seed typed by the operator.
 */

type Body = Record<string, unknown>

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: cfgRow }, { data: days }, { data: agg }, { data: rev }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle(),
      supabase.from("pit_draw_days").select("*").order("day", { ascending: false }).limit(14),
      supabase.from("pit_qualified_plays").select("ammo_cost.sum()")
        .eq("source", "ammo").gt("ammo_cost", 0).gte("played_at", `${today}T00:00:00.000Z`),
      supabase.from("pit_ammo_purchases").select("usd_cents")
        .eq("status", "confirmed").gte("confirmed_at", `${today}T00:00:00.000Z`),
    ])

    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(cfgRow?.value || "{}") } catch {}
    const roomTickets = Number((agg?.[0] as { sum?: number } | undefined)?.sum) || 0
    const poolPct = Number(cfg.draw_pool_pct) || 10
    // the pile is a slice of money confirmed today; tickets only decide who wins it
    const revenueCents = (rev || []).reduce((a: number, r: { usd_cents: number }) => a + (Number(r.usd_cents) || 0), 0)

    return NextResponse.json({
      knobs: {
        draw_enabled: cfg.draw_enabled === true,
        draw_pool_pct: poolPct,
        draw_split_pct: cfg.draw_split_pct ?? [40, 25, 15, 12, 8],
      },
      today: { day: today, tickets: roomTickets, pool_forming_cents: Math.floor((revenueCents * poolPct) / 100) },
      days: days || [],
    })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const b = (await request.json().catch(() => ({}))) as Body
    const supabase = await createAdminClient()
    const action = String(b.action || "")

    if (action === "knobs") {
      const { data: row } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(row?.value || "{}") } catch {}

      const patch: Record<string, unknown> = {}
      if (typeof b.draw_enabled === "boolean") patch.draw_enabled = b.draw_enabled
      if (b.draw_pool_pct !== undefined) {
        const v = Number(b.draw_pool_pct)
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          return NextResponse.json({ error: "Pool % must be 0 to 100." }, { status: 400 })
        }
        patch.draw_pool_pct = v
      }
      if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 })

      const { error } = await supabase.from("app_settings")
        .update({ value: JSON.stringify({ ...cfg, ...patch }), updated_at: new Date().toISOString() })
        .eq("key", "pit_config")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await logAdminAction(supabase, request, session.username, "draw.knobs", patch)
      return NextResponse.json({ ok: true, knobs: patch })
    }

    if (action === "settle") {
      const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null
      const seed = typeof b.seed === "string" ? b.seed.trim() : ""
      if (!day) return NextResponse.json({ error: "Which day?" }, { status: 400 })
      if (seed.length < 8) return NextResponse.json({ error: "Seed too short. Use a blockhash from after the day closed." }, { status: 400 })

      const { data, error } = await supabase.rpc("pit_draw_settle", { p_day: day, p_seed: seed })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const r = (data || {}) as Record<string, unknown>
      if (r.ok === false) {
        const msg = r.reason === "too_early" ? "That day isn't over yet."
          : r.reason === "disabled" ? "The Draw is off. Turn it on first."
          : r.reason === "bad_seed" ? "Seed too short."
          : "Could not settle."
        return NextResponse.json({ error: msg, ...r }, { status: 409 })
      }

      await logAdminAction(supabase, request, session.username, "draw.settle", { day, result: r })
      return NextResponse.json({ ok: true, result: r })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
