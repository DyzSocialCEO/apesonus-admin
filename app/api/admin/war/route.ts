import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/war — the War Desk backend.
 *
 * GET   → seasons (all, newest first), live standings, per-kingdom rosters
 *         for the current season, and the conviction_enabled flag.
 * PATCH → edit a season row: name, enrollment_ends_at, scheduled_end_at,
 *         started_at, ember_prize_pool. Editing dates on the LIVE season is
 *         how Season 1 gets seeded with real launch dates.
 * POST  → { action: "settle", season_id }        — runs pit_settle_season
 *         { action: "create", ... }              — new season (only when no
 *                                                  season is current)
 *         { action: "set_conviction", enabled }  — flips conviction_enabled
 *                                                  in pit_config
 *
 * Every mutation writes admin_audit_log.
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  const [seasonsRes, standingsRes, cfgRes] = await Promise.all([
    supabase
      .from("pit_war_seasons")
      .select("id, name, status, is_current, started_at, enrollment_ends_at, scheduled_end_at, ended_at, settled_at, winner_kingdom_id, prize_name, prize_token_mint, prize_sponsor, prize_sponsor_url, prize_image_url, prize_reveal_at")
      .order("id", { ascending: false }),
    supabase.rpc("pit_kingdom_ember_standings"),
    supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle(),
  ])

  const seasons = seasonsRes.data || []
  const current = seasons.find((s: any) => s.is_current) || null

  // Rosters for the current season: population + the 15 newest pledges per
  // kingdom, with display names where users set one.
  const rosters: Record<string, { count: number; recent: { name: string; pledged_at: string }[] }> = {}
  if (current) {
    const { data: pledges } = await supabase
      .from("pit_allegiance")
      .select("user_id, kingdom_id, pledged_at")
      .eq("season_id", current.id)
      .order("pledged_at", { ascending: false })

    const rows = pledges || []
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id)))
    const names = new Map<string, string>()
    if (userIds.length) {
      // Chunk to keep the IN() list sane at scale.
      for (let i = 0; i < userIds.length; i += 500) {
        const { data: us } = await supabase
          .from("users")
          .select("id, display_name")
          .in("id", userIds.slice(i, i + 500))
        for (const u of us || []) {
          if (u.display_name && String(u.display_name).trim()) names.set(u.id, String(u.display_name).trim())
        }
      }
    }
    const anon = (uid: string) => "ape_" + uid.replace(/-/g, "").slice(0, 6)
    for (const r of rows as any[]) {
      if (!rosters[r.kingdom_id]) rosters[r.kingdom_id] = { count: 0, recent: [] }
      rosters[r.kingdom_id].count += 1
      if (rosters[r.kingdom_id].recent.length < 15) {
        rosters[r.kingdom_id].recent.push({ name: names.get(r.user_id) || anon(r.user_id), pledged_at: r.pledged_at })
      }
    }
  }

  let convictionEnabled = false
  let warEnabled = false
  try {
    const cfg = JSON.parse(cfgRes.data?.value || "{}")
    convictionEnabled = cfg.conviction_enabled === true
    warEnabled = cfg.war_enabled === true
  } catch {}

  return NextResponse.json({
    seasons,
    standings: standingsRes.data || [],
    rosters,
    conviction_enabled: convictionEnabled,
    war_enabled: warEnabled,
  })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  let body: any = {}
  try { body = await req.json() } catch {}
  const seasonId = Number(body?.season_id)
  if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim()
  for (const k of ["started_at", "enrollment_ends_at", "scheduled_end_at"]) {
    if (body[k]) {
      const t = new Date(body[k])
      if (Number.isNaN(t.getTime())) return NextResponse.json({ error: `${k} is not a valid date` }, { status: 400 })
      patch[k] = t.toISOString()
    }
  }
  // Prize vault. Sealed until prize_reveal_at passes — the public season
  // route enforces that; this admin surface always sees everything.
  for (const k of ["prize_name", "prize_token_mint", "prize_sponsor", "prize_sponsor_url", "prize_image_url"]) {
    if (body[k] !== undefined) patch[k] = String(body[k] || "").trim() || null
  }
  if (body.prize_reveal_at !== undefined) {
    if (!body.prize_reveal_at) {
      patch.prize_reveal_at = null
    } else {
      const t = new Date(body.prize_reveal_at)
      if (Number.isNaN(t.getTime())) return NextResponse.json({ error: "prize_reveal_at is not a valid date" }, { status: 400 })
      patch.prize_reveal_at = t.toISOString()
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 })

  const { data: before } = await supabase.from("pit_war_seasons").select("*").eq("id", seasonId).maybeSingle()
  if (!before) return NextResponse.json({ error: "unknown season" }, { status: 404 })
  if (before.settled_at) return NextResponse.json({ error: "season already settled" }, { status: 400 })

  const { error } = await supabase.from("pit_war_seasons").update(patch).eq("id", seasonId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(supabase, req, session.username, "war.season.update", { season_id: seasonId, patch })
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()

  let body: any = {}
  try { body = await req.json() } catch {}
  const action = String(body?.action || "")

  if (action === "settle") {
    const seasonId = Number(body?.season_id)
    if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 })
    const { data, error } = await supabase.rpc("pit_settle_season", {
      p_season_id: seasonId,
      p_actor: session.username || "admin",
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(supabase, req, session.username, "war.season.settle", { season_id: seasonId, result: data })
    return NextResponse.json(data as Record<string, unknown>)
  }

  if (action === "create") {
    const { data: current } = await supabase
      .from("pit_war_seasons").select("id").eq("is_current", true).maybeSingle()
    if (current) return NextResponse.json({ error: "a season is already current — settle it first" }, { status: 400 })

    const name = String(body?.name || "").trim()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const enrollmentDays = Math.max(1, Number(body?.enrollment_days) || 7)
    const scheduledEnd = body?.scheduled_end_at ? new Date(body.scheduled_end_at) : null
    if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) {
      return NextResponse.json({ error: "scheduled_end_at is not a valid date" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("pit_war_seasons")
      .insert({
        name,
        status: "enrollment",
        is_current: true,
        started_at: new Date().toISOString(),
        enrollment_ends_at: new Date(Date.now() + enrollmentDays * 86400000).toISOString(),
        scheduled_end_at: scheduledEnd ? scheduledEnd.toISOString() : null,
      })
      .select("id")
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, req, session.username, "war.season.create", { season_id: data?.id, name })
    return NextResponse.json({ ok: true, season_id: data?.id })
  }

  if (action === "set_war") {
    const enabled = body?.enabled === true
    const { data: row } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(row?.value || "{}") } catch {}
    const beforeVal = cfg.war_enabled === true
    cfg.war_enabled = enabled
    const { error } = await supabase
      .from("app_settings")
      .update({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() })
      .eq("key", "pit_config")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, req, session.username, "war.flag.change", { before: beforeVal, after: enabled })
    return NextResponse.json({ ok: true, war_enabled: enabled })
  }

  if (action === "set_conviction") {
    const enabled = body?.enabled === true
    const { data: row } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(row?.value || "{}") } catch {}
    const beforeVal = cfg.conviction_enabled === true
    cfg.conviction_enabled = enabled
    const { error } = await supabase
      .from("app_settings")
      .update({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() })
      .eq("key", "pit_config")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, req, session.username, "war.conviction_flag.change", { before: beforeVal, after: enabled })
    return NextResponse.json({ ok: true, conviction_enabled: enabled })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
