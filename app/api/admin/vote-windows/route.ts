import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/vote-windows
 *
 * Admin management of vote_windows. A vote window is a bounded time
 * period during which users cast ballots on a slate of nominations.
 *
 * Methods:
 *   GET     — list all windows (open first, then closed, newest first)
 *             with attached nominations + live vote counts per slot
 *   POST    — open a new window (body: windowType, opensAt, closesAt,
 *             coinOfMonthFor?, nominationIds[])
 *             Opening the window transitions those nominations from
 *             'pending' to 'voting'.
 *   POST ?action=close  — force-close an open window early
 *   DELETE  — only allowed on windows with 0 ballots (admin mistake)
 *
 * Winners are NEVER set directly. The close_vote_window(id) RPC is
 * the sole source of truth for winner determination.
 */

const VALID_WINDOW_TYPES = new Set(["coin_of_month", "variable"])

async function gate(request: Request) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const ip = getClientIp(request)
  const { success } = await adminGeneralRatelimit().limit(`vote-windows:${ip}`)
  if (!success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) }
  return { session }
}

function shapeWindow(row: Record<string, unknown>) {
  return {
    id: row.id,
    windowType: row.window_type,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    status: row.status,
    winnerNominationId: row.winner_nomination_id,
    noWinner: row.no_winner,
    coinOfMonthFor: row.coin_of_month_for,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  }
}

// ═════════════════════════════════════════════════════════════════
// GET — list all windows with slate + vote counts
// ═════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error

  try {
    const supabase = await createAdminClient()

    const { data: windows, error: windowsErr } = await supabase
      .from("vote_windows")
      .select("*")
      .order("status", { ascending: true })   // 'open' < 'closed' alphabetically
      .order("created_at", { ascending: false })

    if (windowsErr) {
      console.error("vote-windows list error", windowsErr)
      return NextResponse.json({ error: "Failed to fetch windows" }, { status: 500 })
    }

    const windowIds = (windows ?? []).map(w => w.id)

    // ── Fetch nominations attached to these windows ──
    const { data: nominations } = windowIds.length > 0
      ? await supabase
          .from("nominations")
          .select("id, vote_window_id, project_name, project_key, nomination_type, proposal_text, status")
          .in("vote_window_id", windowIds)
      : { data: [] }

    // ── Tally ballots per nomination in each window ──
    const { data: ballots } = windowIds.length > 0
      ? await supabase
          .from("ballots")
          .select("vote_window_id, nomination_id")
          .in("vote_window_id", windowIds)
      : { data: [] }

    // Count ballots: Map<windowId, Map<nominationId, count>>
    const counts = new Map<number, Map<number, number>>()
    for (const b of ballots ?? []) {
      const wId = b.vote_window_id as number
      const nId = b.nomination_id as number
      if (!counts.has(wId)) counts.set(wId, new Map())
      const inner = counts.get(wId)!
      inner.set(nId, (inner.get(nId) ?? 0) + 1)
    }

    // Group nominations by window_id
    const nomsByWindow = new Map<number, Array<Record<string, unknown>>>()
    for (const n of nominations ?? []) {
      const wId = n.vote_window_id as number
      if (!nomsByWindow.has(wId)) nomsByWindow.set(wId, [])
      nomsByWindow.get(wId)!.push({
        id: n.id,
        projectName: n.project_name,
        projectKey: n.project_key,
        nominationType: n.nomination_type,
        proposalText: n.proposal_text,
        status: n.status,
        voteCount: counts.get(wId)?.get(n.id as number) ?? 0,
      })
    }

    return NextResponse.json({
      windows: (windows ?? []).map(w => {
        const slate = nomsByWindow.get(w.id) ?? []
        const totalBallots = slate.reduce((sum, n) => sum + (n.voteCount as number), 0)
        return {
          ...shapeWindow(w),
          slate,
          totalBallots,
        }
      }),
    })
  } catch (err) {
    console.error("vote-windows GET error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// POST — open a new window OR close an existing one (?action=close)
// ═════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  const url = new URL(request.url)
  const action = url.searchParams.get("action")
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // ── Handle close action (on an existing window) ──
  if (action === "close") {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Verify window exists and is open
    const { data: win } = await supabase
      .from("vote_windows")
      .select("id, status")
      .eq("id", id)
      .single()

    if (!win) return NextResponse.json({ error: "Window not found" }, { status: 404 })
    if (win.status !== "open") {
      return NextResponse.json({ error: "Window is not open" }, { status: 409 })
    }

    // Call the close_vote_window RPC — source of truth for winner logic
    const { data: result, error: rpcErr } = await supabase.rpc("close_vote_window", {
      p_window_id: id,
    })

    if (rpcErr) {
      console.error("close_vote_window rpc error", rpcErr)
      return NextResponse.json({ error: "Failed to close window" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "vote_window.close", {
      id,
      winnerNominationId: Array.isArray(result) ? result[0]?.winner_id : null,
      noWinner: Array.isArray(result) ? result[0]?.no_winner : null,
    })

    return NextResponse.json({ success: true, result: Array.isArray(result) ? result[0] : result })
  }

  // ── Otherwise: open a new window ──
  const windowType = String(body.windowType ?? "").trim()
  const opensAt = body.opensAt ? String(body.opensAt).trim() : null
  const closesAt = body.closesAt ? String(body.closesAt).trim() : null
  const coinOfMonthFor = body.coinOfMonthFor ? String(body.coinOfMonthFor).trim() : null
  const nominationIds: unknown = body.nominationIds

  if (!VALID_WINDOW_TYPES.has(windowType)) {
    return NextResponse.json({ error: "windowType must be coin_of_month or variable" }, { status: 400 })
  }
  if (!opensAt || !closesAt) {
    return NextResponse.json({ error: "opensAt + closesAt required (ISO timestamps)" }, { status: 400 })
  }

  const opensDate = new Date(opensAt)
  const closesDate = new Date(closesAt)
  if (isNaN(opensDate.getTime()) || isNaN(closesDate.getTime())) {
    return NextResponse.json({ error: "Invalid timestamps" }, { status: 400 })
  }
  if (closesDate.getTime() <= opensDate.getTime()) {
    return NextResponse.json({ error: "closesAt must be after opensAt" }, { status: 400 })
  }

  if (windowType === "coin_of_month") {
    if (!coinOfMonthFor || !/^\d{4}-\d{2}-\d{2}$/.test(coinOfMonthFor)) {
      return NextResponse.json(
        { error: "coinOfMonthFor (YYYY-MM-DD) required for CoM windows" },
        { status: 400 }
      )
    }
  }

  if (!Array.isArray(nominationIds) || nominationIds.length < 2) {
    return NextResponse.json(
      { error: "At least 2 nominations must be attached to open a window" },
      { status: 400 }
    )
  }
  const nomIdsNum = nominationIds
    .map(v => Number(v))
    .filter(n => Number.isInteger(n) && n > 0)
  if (nomIdsNum.length !== nominationIds.length) {
    return NextResponse.json({ error: "Invalid nominationIds" }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // Verify all nominations exist AND are currently 'pending' (only
  // pending noms can be attached to a new window; voting/won/lost/etc
  // are already in-flight or done).
  const { data: nominations } = await supabase
    .from("nominations")
    .select("id, status, nomination_type")
    .in("id", nomIdsNum)

  if ((nominations ?? []).length !== nomIdsNum.length) {
    return NextResponse.json(
      { error: "One or more nominations not found" },
      { status: 404 }
    )
  }

  for (const n of nominations ?? []) {
    if (n.status !== "pending") {
      return NextResponse.json(
        { error: `Nomination ${n.id} is not pending (status=${n.status}) and can't be attached` },
        { status: 409 }
      )
    }
  }

  // Consistency: if windowType=coin_of_month, require all attached
  // nominations to have nomination_type='coin_of_month' too.
  if (windowType === "coin_of_month") {
    for (const n of nominations ?? []) {
      if (n.nomination_type !== "coin_of_month") {
        return NextResponse.json(
          { error: `Nomination ${n.id} is type '${n.nomination_type}', not coin_of_month` },
          { status: 400 }
        )
      }
    }
  }

  // Enforce uniqueness of CoM windows per month at the app level
  if (windowType === "coin_of_month" && coinOfMonthFor) {
    const { data: existing } = await supabase
      .from("vote_windows")
      .select("id")
      .eq("window_type", "coin_of_month")
      .eq("coin_of_month_for", coinOfMonthFor)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: `A CoM window already exists for ${coinOfMonthFor}` },
        { status: 409 }
      )
    }
  }

  // ── Insert the window ──
  const { data: created, error: insertErr } = await supabase
    .from("vote_windows")
    .insert({
      window_type: windowType,
      opens_at: opensDate.toISOString(),
      closes_at: closesDate.toISOString(),
      status: "open",
      coin_of_month_for: windowType === "coin_of_month" ? coinOfMonthFor : null,
    })
    .select()
    .single()

  if (insertErr || !created) {
    console.error("vote_window insert error", insertErr)
    return NextResponse.json({ error: "Failed to open window" }, { status: 500 })
  }

  // ── Attach nominations — flip status to 'voting' and set vote_window_id ──
  const { error: updateErr } = await supabase
    .from("nominations")
    .update({
      vote_window_id: created.id,
      status: "voting",
      updated_at: new Date().toISOString(),
    })
    .in("id", nomIdsNum)

  if (updateErr) {
    console.error("nominations attach error", updateErr)
    // Roll back the window if we couldn't attach — otherwise we have
    // an empty window sitting there with nothing to vote on.
    await supabase.from("vote_windows").delete().eq("id", created.id)
    return NextResponse.json({ error: "Failed to attach nominations" }, { status: 500 })
  }

  await logAdminAction(supabase, request, session.username, "vote_window.open", {
    id: created.id,
    windowType,
    coinOfMonthFor,
    nominationCount: nomIdsNum.length,
    nominationIds: nomIdsNum,
  })

  return NextResponse.json({ window: shapeWindow(created) })
}

// ═════════════════════════════════════════════════════════════════
// DELETE — only allowed on windows with 0 ballots (admin mistake)
// ═════════════════════════════════════════════════════════════════
export async function DELETE(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  try {
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { count: ballotCount } = await supabase
      .from("ballots")
      .select("id", { count: "exact", head: true })
      .eq("vote_window_id", id)

    if ((ballotCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${ballotCount} ballots cast. Close the window instead.` },
        { status: 409 }
      )
    }

    // Revert attached nominations back to pending before deletion
    await supabase
      .from("nominations")
      .update({ status: "pending", vote_window_id: null, updated_at: new Date().toISOString() })
      .eq("vote_window_id", id)

    const { error: deleteErr } = await supabase
      .from("vote_windows")
      .delete()
      .eq("id", id)

    if (deleteErr) {
      console.error("vote_window delete error", deleteErr)
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "vote_window.delete", { id })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("vote-windows DELETE error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
