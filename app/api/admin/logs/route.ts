import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/logs
 *
 * Read-only viewer for the error_logs table.
 * Supports filtering by source and severity, and cursor-based pagination
 * via the `before` query param (pass the created_at of the oldest row you
 * already have to fetch the next page).
 *
 * Query params:
 *   source       — optional, filter to a specific source bucket
 *   severity     — optional, 'error' | 'warn' | 'info'
 *   telegramId   — optional, filter to a specific user's errors
 *   q            — optional, substring search on message (case-insensitive)
 *   before       — optional ISO timestamp, for pagination
 *   limit        — optional, default 50, max 200
 */

const VALID_SOURCES = new Set([
  "window_error",
  "unhandled_rejection",
  "error_boundary",
  "mini_player",
  "app_content",
  "audio_provider",
  "payment",
  "api",
  "other",
])

const VALID_SEVERITIES = new Set(["error", "warn", "info"])

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)

    const source = searchParams.get("source")
    const severity = searchParams.get("severity")
    const telegramIdRaw = searchParams.get("telegramId")
    const q = searchParams.get("q")
    const before = searchParams.get("before")
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

    const supabase = await createAdminClient()

    let query = supabase
      .from("error_logs")
      .select("id, created_at, source, severity, message, stack, component_stack, url, user_agent, telegram_id, extra")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (source && VALID_SOURCES.has(source)) {
      query = query.eq("source", source)
    }
    if (severity && VALID_SEVERITIES.has(severity)) {
      query = query.eq("severity", severity)
    }
    if (telegramIdRaw) {
      const n = parseInt(telegramIdRaw, 10)
      if (Number.isFinite(n)) query = query.eq("telegram_id", n)
    }
    if (q && q.trim().length > 0) {
      // ilike is case-insensitive substring match; escape % and _ to prevent wildcards
      const safe = q.replace(/[%_]/g, "\\$&")
      query = query.ilike("message", `%${safe}%`)
    }
    if (before) {
      query = query.lt("created_at", before)
    }

    const { data: logs, error } = await query
    if (error) throw error

    // Aggregate counts for the header badges — cheap, bounded by 24h window
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentCounts } = await supabase
      .from("error_logs")
      .select("source, severity")
      .gte("created_at", since)
      .limit(5000)

    const countsBySource: Record<string, number> = {}
    const countsBySeverity: Record<string, number> = {}
    let total24h = 0
    if (recentCounts) {
      for (const row of recentCounts) {
        total24h++
        countsBySource[row.source] = (countsBySource[row.source] || 0) + 1
        countsBySeverity[row.severity] = (countsBySeverity[row.severity] || 0) + 1
      }
    }

    return NextResponse.json({
      logs: logs || [],
      counts: {
        total24h,
        bySource: countsBySource,
        bySeverity: countsBySeverity,
      },
    })
  } catch (error: any) {
    console.error("GET /api/admin/logs error:", error)
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/logs?id=<uuid>
 * DELETE /api/admin/logs?all=1              — wipe everything
 * DELETE /api/admin/logs?olderThanDays=30   — prune by age
 *
 * Destructive but useful. Gated on the admin session.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const all = searchParams.get("all")
    const olderThanDays = searchParams.get("olderThanDays")

    const supabase = await createAdminClient()

    if (id) {
      const { error } = await supabase.from("error_logs").delete().eq("id", id)
      if (error) throw error
      return NextResponse.json({ success: true, deleted: 1 })
    }

    if (olderThanDays) {
      const days = parseInt(olderThanDays, 10)
      if (!Number.isFinite(days) || days < 1) {
        return NextResponse.json({ error: "Invalid olderThanDays" }, { status: 400 })
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { error, count } = await supabase
        .from("error_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoff)
      if (error) throw error
      return NextResponse.json({ success: true, deleted: count || 0 })
    }

    if (all === "1") {
      // neq on a non-null column is the canonical "delete all" in PostgREST
      const { error, count } = await supabase
        .from("error_logs")
        .delete({ count: "exact" })
        .not("id", "is", null)
      if (error) throw error
      return NextResponse.json({ success: true, deleted: count || 0 })
    }

    return NextResponse.json({ error: "Missing id, all, or olderThanDays" }, { status: 400 })
  } catch (error: any) {
    console.error("DELETE /api/admin/logs error:", error)
    return NextResponse.json({ error: "Failed to delete logs" }, { status: 500 })
  }
}
