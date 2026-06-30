import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession, hashPassword } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function requireAdmin() {
  const s = await getSession()
  return s && s.role !== "partner" ? s : null
}

/** PATCH { is_active?, password? } — toggle access or reset the password. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = await request.json().catch(() => ({})) as { is_active?: unknown; password?: unknown }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("is_active" in b) patch.is_active = !!b.is_active
  if ("password" in b) {
    const pw = String(b.password ?? "")
    if (pw.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
    patch.password_hash = hashPassword(pw); patch.must_change_password = true
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "Nothing to update." }, { status: 400 })

  const supabase = await createAdminClient()
  const { error } = await supabase.from("partner_accounts").update(patch).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE — remove a partner login (does not touch the pit_partners row). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const supabase = await createAdminClient()
  const { error } = await supabase.from("partner_accounts").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
