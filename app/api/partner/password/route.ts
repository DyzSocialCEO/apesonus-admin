import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession, verifyPasswordHash, hashPassword } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/partner/password { current, next } — partner changes own password. */
export async function POST(request: Request) {
  const s = await getSession()
  if (!s || s.role !== "partner" || !s.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const b = await request.json().catch(() => ({})) as { current?: string; next?: string }
  const current = String(b.current ?? ""), next = String(b.next ?? "")
  if (next.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 })

  const supabase = await createAdminClient()
  const { data: acct } = await supabase
    .from("partner_accounts").select("id, password_hash")
    .eq("email", s.username.toLowerCase().trim()).maybeSingle()
  if (!acct) return NextResponse.json({ error: "Account not found." }, { status: 404 })
  if (!verifyPasswordHash(current, acct.password_hash as string)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 })
  }
  const { error } = await supabase.from("partner_accounts")
    .update({ password_hash: hashPassword(next), must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", acct.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
