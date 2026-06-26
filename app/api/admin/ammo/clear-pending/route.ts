import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/admin/ammo/clear-pending
 *
 * Housekeeping: marks pending Ammo orders whose pay window has already
 * elapsed as "expired", across all users, so the purchases list stays clean.
 * It never touches a confirmed order, and never a pending order still inside
 * its window (a real payment could still be in flight). Returns how many cleared.
 *
 * Note: "expired" is the status value permitted by the pit_ammo_purchases
 * status CHECK constraint (pending | confirmed | failed | expired). It is the
 * correct label here since these orders are past their expires_at.
 *
 * Safe: an expired order's unique pay amount is preserved, and the Helius
 * webhook still credits it if that exact amount lands — so a late payment to
 * a cleared order is not lost.
 */
export async function POST() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("pit_ammo_purchases")
      .update({ status: "expired", hidden: true })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .select("id")

    if (error) {
      console.error("[admin/ammo/clear-pending] update failed:", error)
      return NextResponse.json({ error: "Could not clear pending" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, cleared: (data || []).length })
  } catch (e: any) {
    console.error("[admin/ammo/clear-pending] unexpected:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
