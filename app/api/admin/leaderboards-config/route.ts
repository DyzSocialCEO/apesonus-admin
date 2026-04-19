import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: read/update both leaderboard configs.
 *
 *   GET   → { hallOfFame, weeklyTop10 }
 *   PATCH → accepts partial updates for either config
 *
 * Both configs are feature-flagged. is_active controls whether the
 * main app surfaces the real leaderboard or the coming_soon_message.
 */

const MAX_MESSAGE_LEN = 500
const MAX_POT_STARS = 1_000_000

interface HallConfig {
  is_active: boolean
  coming_soon_message: string
}

interface WeeklyConfig {
  is_active: boolean
  coming_soon_message: string
  current_pot_stars: number
  pot_distribution: number[]
  current_week_start: string | null
}

async function readBoth(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<{ hallOfFame: HallConfig; weeklyTop10: WeeklyConfig }> {
  const [hofRes, wklRes] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "hall_of_fame_config").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "weekly_top10_config").maybeSingle(),
  ])

  const hallOfFame: HallConfig = (() => {
    const v = hofRes.data?.value
    if (!v) return { is_active: false, coming_soon_message: "" }
    try {
      const parsed = typeof v === "string" ? JSON.parse(v) : v
      return {
        is_active: parsed.is_active === true,
        coming_soon_message: String(parsed.coming_soon_message || ""),
      }
    } catch {
      return { is_active: false, coming_soon_message: "" }
    }
  })()

  const weeklyTop10: WeeklyConfig = (() => {
    const v = wklRes.data?.value
    if (!v) {
      return {
        is_active: false,
        coming_soon_message: "",
        current_pot_stars: 0,
        pot_distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        current_week_start: null,
      }
    }
    try {
      const parsed = typeof v === "string" ? JSON.parse(v) : v
      const dist = Array.isArray(parsed.pot_distribution)
        ? parsed.pot_distribution.map((x: unknown) => Number(x) || 0).slice(0, 10)
        : []
      while (dist.length < 10) dist.push(0)
      return {
        is_active: parsed.is_active === true,
        coming_soon_message: String(parsed.coming_soon_message || ""),
        current_pot_stars: Number(parsed.current_pot_stars) || 0,
        pot_distribution: dist,
        current_week_start: parsed.current_week_start || null,
      }
    } catch {
      return {
        is_active: false,
        coming_soon_message: "",
        current_pot_stars: 0,
        pot_distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        current_week_start: null,
      }
    }
  })()

  return { hallOfFame, weeklyTop10 }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const both = await readBoth(supabase)
    return NextResponse.json(both)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────────────
function validateHall(patch: Partial<HallConfig>, existing: HallConfig): { ok: boolean; error?: string; next?: HallConfig } {
  const next: HallConfig = { ...existing }

  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== "boolean") return { ok: false, error: "hallOfFame.is_active must be boolean" }
    next.is_active = patch.is_active
  }
  if (patch.coming_soon_message !== undefined) {
    const m = String(patch.coming_soon_message).trim()
    if (m.length === 0) return { ok: false, error: "hallOfFame.coming_soon_message cannot be empty" }
    if (m.length > MAX_MESSAGE_LEN) return { ok: false, error: `hallOfFame.coming_soon_message max ${MAX_MESSAGE_LEN} chars` }
    next.coming_soon_message = m
  }
  return { ok: true, next }
}

function validateWeekly(patch: Partial<WeeklyConfig>, existing: WeeklyConfig): { ok: boolean; error?: string; next?: WeeklyConfig; warnings?: string[] } {
  const next: WeeklyConfig = { ...existing }
  const warnings: string[] = []

  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== "boolean") return { ok: false, error: "weeklyTop10.is_active must be boolean" }
    next.is_active = patch.is_active
  }
  if (patch.coming_soon_message !== undefined) {
    const m = String(patch.coming_soon_message).trim()
    if (m.length === 0) return { ok: false, error: "weeklyTop10.coming_soon_message cannot be empty" }
    if (m.length > MAX_MESSAGE_LEN) return { ok: false, error: `weeklyTop10.coming_soon_message max ${MAX_MESSAGE_LEN} chars` }
    next.coming_soon_message = m
  }
  if (patch.current_pot_stars !== undefined) {
    const p = Number(patch.current_pot_stars)
    if (!Number.isFinite(p) || !Number.isInteger(p)) return { ok: false, error: "weeklyTop10.current_pot_stars must be a whole number" }
    if (p < 0 || p > MAX_POT_STARS) return { ok: false, error: `weeklyTop10.current_pot_stars must be 0 to ${MAX_POT_STARS}` }
    next.current_pot_stars = p
  }
  if (patch.pot_distribution !== undefined) {
    if (!Array.isArray(patch.pot_distribution) || patch.pot_distribution.length !== 10) {
      return { ok: false, error: "weeklyTop10.pot_distribution must be array of exactly 10 numbers" }
    }
    const dist = patch.pot_distribution.map((v, i) => {
      const n = Number(v)
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw new Error(`pot_distribution[${i}] must be a non-negative whole number`)
      }
      return n
    })
    next.pot_distribution = dist
  }

  // Soft check: distribution should sum to pot_stars
  const sum = next.pot_distribution.reduce((a, b) => a + b, 0)
  if (sum !== next.current_pot_stars) {
    warnings.push(`pot_distribution sum (${sum}) does not match current_pot_stars (${next.current_pot_stars})`)
  }

  return { ok: true, next, warnings }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`lb:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const hallPatch = body.hallOfFame as Partial<HallConfig> | undefined
    const weeklyPatch = body.weeklyTop10 as Partial<WeeklyConfig> | undefined

    if (!hallPatch && !weeklyPatch) {
      return NextResponse.json(
        { error: "Must provide hallOfFame or weeklyTop10" },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()
    const before = await readBoth(supabase)

    let nextHall = before.hallOfFame
    let nextWeekly = before.weeklyTop10
    const warnings: string[] = []

    if (hallPatch) {
      const r = validateHall(hallPatch, before.hallOfFame)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      nextHall = r.next!
    }

    if (weeklyPatch) {
      try {
        const r = validateWeekly(weeklyPatch, before.weeklyTop10)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
        nextWeekly = r.next!
        if (r.warnings?.length) warnings.push(...r.warnings)
      } catch (err: any) {
        return NextResponse.json({ error: err.message || "Invalid weekly config" }, { status: 400 })
      }
    }

    // Write changes sequentially. Supabase query builders are thenables
    // not true Promises, so we await each directly instead of Promise.all.
    if (hallPatch) {
      const { error } = await supabase.from("app_settings").upsert(
        { key: "hall_of_fame_config", value: JSON.stringify(nextHall), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (weeklyPatch) {
      const { error } = await supabase.from("app_settings").upsert(
        { key: "weekly_top10_config", value: JSON.stringify(nextWeekly), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    await logAdminAction(
      supabase,
      request,
      session.username,
      "leaderboards_config.update",
      {
        before: { hallOfFame: before.hallOfFame, weeklyTop10: before.weeklyTop10 },
        after: { hallOfFame: nextHall, weeklyTop10: nextWeekly },
        patched: {
          hallOfFame: hallPatch ? true : false,
          weeklyTop10: weeklyPatch ? true : false,
        },
        warnings: warnings.length ? warnings : undefined,
      }
    )

    return NextResponse.json({
      success: true,
      hallOfFame: nextHall,
      weeklyTop10: nextWeekly,
      warnings: warnings.length ? warnings : undefined,
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
