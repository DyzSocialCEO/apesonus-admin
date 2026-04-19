import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin API: read/update Genesis Badge threshold + max_holders.
 *
 * Reads from genesis_status view + get_genesis_config() function.
 * Writes directly to app_settings.genesis_badge_config, which is the
 * same row open_genesis_window() and get_genesis_config() read.
 *
 * Bounds:
 *   - threshold: 100 to 1,000,000 $ONUS
 *   - max_holders: 1 to 10,000, but not below current holders_issued
 *
 * This endpoint does NOT touch started_at or closed — those are owned by
 * /api/admin/genesis-window which calls the dedicated SQL functions.
 */

const MIN_THRESHOLD = 100
const MAX_THRESHOLD = 1_000_000
const MIN_MAX_HOLDERS = 1
const MAX_MAX_HOLDERS = 10_000

interface ConfigRow {
  threshold: number
  max_holders: number
  started_at: string | null
  closed: boolean
  holders_issued: number
}

async function readConfig(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<ConfigRow> {
  const { data } = await supabase
    .from("genesis_status")
    .select("threshold, max_holders, started_at, closed, holders_issued")
    .maybeSingle()

  return {
    threshold: Number(data?.threshold ?? 10000),
    max_holders: Number(data?.max_holders ?? 100),
    started_at: data?.started_at ?? null,
    closed: data?.closed === true,
    holders_issued: Number(data?.holders_issued ?? 0),
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const cfg = await readConfig(supabase)

    return NextResponse.json({
      threshold: cfg.threshold,
      maxHolders: cfg.max_holders,
      holdersIssued: cfg.holders_issued,
      slotsLeft: Math.max(0, cfg.max_holders - cfg.holders_issued),
      windowStartedAt: cfg.started_at,
      windowClosed: cfg.closed,
      bounds: {
        minThreshold: MIN_THRESHOLD,
        maxThreshold: MAX_THRESHOLD,
        minMaxHolders: MIN_MAX_HOLDERS,
        maxMaxHolders: MAX_MAX_HOLDERS,
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const { success } = await adminGeneralRatelimit().limit(`gc:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const { threshold, maxHolders } = body as {
      threshold?: number
      maxHolders?: number
    }

    if (threshold === undefined && maxHolders === undefined) {
      return NextResponse.json(
        { error: "Must provide threshold or maxHolders" },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()
    const before = await readConfig(supabase)

    // ── Validate threshold ──
    let nextThreshold = before.threshold
    if (threshold !== undefined) {
      const t = Number(threshold)
      if (!Number.isFinite(t) || !Number.isInteger(t)) {
        return NextResponse.json(
          { error: "threshold must be a whole number" },
          { status: 400 }
        )
      }
      if (t < MIN_THRESHOLD || t > MAX_THRESHOLD) {
        return NextResponse.json(
          { error: `threshold must be between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}` },
          { status: 400 }
        )
      }
      nextThreshold = t
    }

    // ── Validate maxHolders ──
    let nextMaxHolders = before.max_holders
    if (maxHolders !== undefined) {
      const m = Number(maxHolders)
      if (!Number.isFinite(m) || !Number.isInteger(m)) {
        return NextResponse.json(
          { error: "maxHolders must be a whole number" },
          { status: 400 }
        )
      }
      if (m < MIN_MAX_HOLDERS || m > MAX_MAX_HOLDERS) {
        return NextResponse.json(
          { error: `maxHolders must be between ${MIN_MAX_HOLDERS} and ${MAX_MAX_HOLDERS}` },
          { status: 400 }
        )
      }
      if (m < before.holders_issued) {
        return NextResponse.json(
          {
            error: `Cannot set maxHolders below current holders (${before.holders_issued} already minted)`,
          },
          { status: 400 }
        )
      }
      nextMaxHolders = m
    }

    // ── No-op check ──
    if (
      nextThreshold === before.threshold &&
      nextMaxHolders === before.max_holders
    ) {
      return NextResponse.json({ error: "No changes" }, { status: 400 })
    }

    // ── Build next config, preserving started_at and closed ──
    const nextJson = JSON.stringify({
      threshold: nextThreshold,
      max_holders: nextMaxHolders,
      started_at: before.started_at,
      closed: before.closed,
    })

    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "genesis_badge_config",
          value: nextJson,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // Audit log — record what changed, with a warning flag when window is open.
    const windowActive = before.started_at !== null && !before.closed
    await logAdminAction(
      supabase,
      request,
      session.username,
      "genesis_config.update",
      {
        before: {
          threshold: before.threshold,
          maxHolders: before.max_holders,
        },
        after: {
          threshold: nextThreshold,
          maxHolders: nextMaxHolders,
        },
        windowActive,
        note: windowActive
          ? "Config changed while window is active — may feel unfair to early earners"
          : undefined,
      }
    )

    return NextResponse.json({
      success: true,
      threshold: nextThreshold,
      maxHolders: nextMaxHolders,
      holdersIssued: before.holders_issued,
      slotsLeft: Math.max(0, nextMaxHolders - before.holders_issued),
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
