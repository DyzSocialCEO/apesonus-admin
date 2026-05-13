import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * PATCH /api/admin/subscriptions/[id]
 *
 * Edit an existing subscription row.
 *
 * Body:
 *   { action: 'extend',  seconds: number } — push expires_at forward
 *   { action: 'expire',  reason?: string } — force-expire now
 *   { action: 'revoke',  reason?: string } — revoke + drop user to free
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action: string = body.action
  const reason: string | null = body.reason ? String(body.reason).slice(0, 500) : null

  try {
    const supabase = await createAdminClient()

    // Fetch current row for audit context
    const { data: current, error: fetchErr } = await supabase
      .from("premium_subscriptions")
      .select("id, user_id, status, expires_at")
      .eq("id", id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    if (action === "extend") {
      const seconds = Number(body.seconds)
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return NextResponse.json(
          { error: "seconds required and positive" },
          { status: 400 },
        )
      }
      // Push expires_at forward from the later of (current expires_at, NOW())
      const baseTs = Math.max(
        new Date(current.expires_at as string).getTime(),
        Date.now(),
      )
      const newExpiresIso = new Date(baseTs + seconds * 1000).toISOString()

      const { error: updErr } = await supabase
        .from("premium_subscriptions")
        .update({ expires_at: newExpiresIso, status: "active" })
        .eq("id", id)
      if (updErr) throw updErr

      // Also push the mirrored expiry on users
      await supabase
        .from("users")
        .update({
          is_premium: true,
          premium_expires_at: newExpiresIso,
        })
        .eq("id", current.user_id as string)

      await logAdminAction(supabase, request, session.username, "subscription.extend", {
        subscriptionId: id,
        userId: current.user_id,
        addedSeconds: seconds,
        newExpiresAt: newExpiresIso,
        reason,
      })

      return NextResponse.json({ ok: true, expiresAt: newExpiresIso })
    }

    if (action === "expire") {
      const { error: updErr } = await supabase
        .from("premium_subscriptions")
        .update({ status: "expired", expires_at: new Date().toISOString() })
        .eq("id", id)
      if (updErr) throw updErr

      // Drop user if no other active sub
      const { count: otherActive } = await supabase
        .from("premium_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", current.user_id as string)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())

      if (!otherActive || otherActive === 0) {
        await supabase
          .from("users")
          .update({
            is_premium: false,
            premium_status: "none",
            verification_tier: "free",
            premium_expires_at: null,
          })
          .eq("id", current.user_id as string)
      }

      await logAdminAction(supabase, request, session.username, "subscription.expire", {
        subscriptionId: id,
        userId: current.user_id,
        reason,
      })

      return NextResponse.json({ ok: true })
    }

    if (action === "revoke") {
      const { data, error } = await supabase.rpc("revoke_subscription", {
        p_subscription_id: id,
        p_revoked_by: session.username,
        p_reason: reason,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data

      await logAdminAction(supabase, request, session.username, "subscription.revoke", {
        subscriptionId: id,
        userId: current.user_id,
        reason,
        revoked: row?.revoked === true,
      })

      return NextResponse.json({ ok: row?.revoked === true })
    }

    return NextResponse.json(
      { error: "action must be 'extend', 'expire', or 'revoke'" },
      { status: 400 },
    )
  } catch (err) {
    console.error("[admin/subscriptions/[id] PATCH]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}
