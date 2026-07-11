import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/admin/recent-users — newest signups + live counts (admin only). */
export async function GET() {
  const s = await getSession()
  if (!s || s.role === "partner") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = await createAdminClient()
  const now = Date.now()
  const dayAgo = new Date(now - 86_400_000).toISOString()
  const hourAgo = new Date(now - 3_600_000).toISOString()

  const [recent, total, today, lastHour] = await Promise.all([
    supabase.from("users").select("id, display_name, show_public_name, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", dayAgo),
    supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", hourAgo),
  ])

  const users = (recent.data ?? []).map((u) => ({
    handle: (u.show_public_name && (u.display_name as string | null)?.trim())
      ? (u.display_name as string)
      : `ape_${String(u.id).replace(/-/g, "").slice(0, 6)}`,
    created_at: u.created_at as string,
  }))

  return NextResponse.json({
    users,
    total: total.count ?? 0,
    today: today.count ?? 0,
    last_hour: lastHour.count ?? 0,
  })
}
