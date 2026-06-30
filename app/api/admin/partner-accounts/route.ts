import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession, hashPassword } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
async function requireAdmin() {
  const s = await getSession()
  return s && s.role !== "partner" ? s : null
}

/** GET — partner accounts (with linked partner name) + the partner list for the picker. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const supabase = await createAdminClient()
  const [{ data: accounts }, { data: partners }] = await Promise.all([
    supabase.from("partner_accounts").select("id, email, partner_id, is_active, must_change_password, created_at").order("created_at", { ascending: false }),
    supabase.from("pit_partners").select("id, name").order("name", { ascending: true }),
  ])
  const nameById = new Map((partners ?? []).map((p) => [p.id, p.name]))
  const list = (accounts ?? []).map((a) => ({ ...a, partner_name: nameById.get(a.partner_id) ?? "—" }))
  return NextResponse.json({ accounts: list, partners: partners ?? [] })
}

/** POST { partner_id, email, password } — create a partner login. */
export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = await request.json().catch(() => ({})) as { partner_id?: unknown; email?: unknown; password?: unknown }
  const email = String(b.email ?? "").toLowerCase().trim()
  const password = String(b.password ?? "")
  const partnerId = Number(b.partner_id)

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
  if (!Number.isFinite(partnerId)) return NextResponse.json({ error: "Pick a partner to link." }, { status: 400 })

  const supabase = await createAdminClient()
  const { data: partner } = await supabase.from("pit_partners").select("id").eq("id", partnerId).maybeSingle()
  if (!partner) return NextResponse.json({ error: "That partner no longer exists." }, { status: 400 })

  const { error } = await supabase.from("partner_accounts").insert({
    email, password_hash: hashPassword(password), partner_id: partnerId, must_change_password: true,
  })
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
