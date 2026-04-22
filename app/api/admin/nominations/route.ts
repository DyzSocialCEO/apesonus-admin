import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/nominations
 *
 * Admin moderation of nominations.
 *
 * Methods:
 *   GET    — list nominations, optional ?status=pending|voting|...
 *            Returns endorsement counts per nomination.
 *   PATCH  — update status (admin can reject spam: pending → rejected)
 *            Body: { id, status }
 *   DELETE — hard-remove a nomination. Only allowed if status='pending'
 *            AND no vote_window_id set. Use PATCH to soft-reject when
 *            history matters; DELETE is for clearly junk/test rows.
 *
 * Session-gated, rate-limited, audit-logged on writes.
 *
 * This endpoint also powers the nomination picker on the vote-windows
 * page (C7) — it filters to ?status=pending and returns the shape
 * that page expects.
 */

const VALID_STATUS_UPDATES = new Set(["rejected"])
// Admin can only SET status=rejected via this endpoint. Other state
// transitions (pending→voting, voting→won/lost/expired) happen via
// vote_window flows or the close_vote_window RPC. Keeping this
// endpoint's write surface tiny is the safety model.

async function gate(request: Request) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const ip = getClientIp(request)
  const { success } = await adminGeneralRatelimit().limit(`nominations:${ip}`)
  if (!success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) }
  return { session }
}

// ═════════════════════════════════════════════════════════════════
// GET — list nominations
// ═════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error

  try {
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get("status")
    const typeParam = searchParams.get("type")

    const supabase = await createAdminClient()

    let query = supabase
      .from("nominations")
      .select(`
        id, proposer_telegram_id, project_name, project_key,
        nomination_type, proposal_text, vote_window_id, status,
        created_at, updated_at
      `)
      .order("created_at", { ascending: false })
      .limit(200)

    if (statusParam) {
      const statuses = statusParam.split(",").map(s => s.trim()).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)
    }
    if (typeParam) {
      query = query.eq("nomination_type", typeParam)
    }

    const { data: noms, error } = await query
    if (error) {
      console.error("nominations list error", error)
      return NextResponse.json({ error: "Failed to fetch nominations" }, { status: 500 })
    }

    const rows = noms ?? []
    const ids = rows.map(n => n.id)

    // Endorsement counts — one query, group in JS
    const { data: endorsements } = ids.length > 0
      ? await supabase
          .from("nomination_endorsements")
          .select("nomination_id")
          .in("nomination_id", ids)
      : { data: [] }

    const endorsementCount = new Map<number, number>()
    for (const e of endorsements ?? []) {
      endorsementCount.set(e.nomination_id, (endorsementCount.get(e.nomination_id) ?? 0) + 1)
    }

    return NextResponse.json({
      nominations: rows.map(n => ({
        id: n.id,
        proposerTelegramId: n.proposer_telegram_id ? String(n.proposer_telegram_id) : null,
        projectName: n.project_name,
        projectKey: n.project_key,
        nominationType: n.nomination_type,
        proposalText: n.proposal_text,
        voteWindowId: n.vote_window_id,
        status: n.status,
        endorsementCount: endorsementCount.get(n.id) ?? 0,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      })),
    })
  } catch (err) {
    console.error("nominations GET error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// PATCH — update status (admin can only set 'rejected')
// ═════════════════════════════════════════════════════════════════
export async function PATCH(request: Request) {
  const guard = await gate(request)
  if ("error" in guard) return guard.error
  const { session } = guard

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const id = Number(body.id)
    const status = String(body.status ?? "").trim()

    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 })
    }
    if (!VALID_STATUS_UPDATES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${Array.from(VALID_STATUS_UPDATES).join(", ")}` },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Verify nomination exists and is currently 'pending'.
    // Rejecting a nomination that's already attached to a vote window
    // would leave the window in an inconsistent state — refuse.
    const { data: current } = await supabase
      .from("nominations")
      .select("id, status, vote_window_id")
      .eq("id", id)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: "Nomination not found" }, { status: 404 })
    }
    if (current.status !== "pending") {
      return NextResponse.json(
        { error: `Can only reject pending nominations (current status: ${current.status})` },
        { status: 409 }
      )
    }
    if (current.vote_window_id) {
      return NextResponse.json(
        { error: "Nomination is attached to a vote window; close the window first" },
        { status: 409 }
      )
    }

    const { data: updated, error: updateErr } = await supabase
      .from("nominations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error("nomination reject error", updateErr)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "nomination.reject", { id })

    return NextResponse.json({
      nomination: {
        id: updated.id,
        status: updated.status,
      },
    })
  } catch (err) {
    console.error("nominations PATCH error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ═════════════════════════════════════════════════════════════════
// DELETE — hard-remove (pending only, no window attached)
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

    const { data: current } = await supabase
      .from("nominations")
      .select("id, status, vote_window_id")
      .eq("id", id)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: "Nomination not found" }, { status: 404 })
    }
    if (current.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending nominations can be deleted. Use PATCH to reject others." },
        { status: 409 }
      )
    }
    if (current.vote_window_id) {
      return NextResponse.json(
        { error: "Attached to a vote window — close window first" },
        { status: 409 }
      )
    }

    // Delete endorsements first (no ON DELETE CASCADE assumed)
    await supabase
      .from("nomination_endorsements")
      .delete()
      .eq("nomination_id", id)

    const { error: deleteErr } = await supabase
      .from("nominations")
      .delete()
      .eq("id", id)

    if (deleteErr) {
      console.error("nomination delete error", deleteErr)
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username, "nomination.delete", { id })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("nominations DELETE error", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
