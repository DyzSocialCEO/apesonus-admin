import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * /api/admin/abuse
 *
 * GET  the two cluster lists, plus everything known about one patient.
 * POST flag a patient, void their Doses, or put them back.
 *
 * WHAT THIS IS NOT: proof. A machine carrying two patient files is a family
 * sharing a laptop as often as it is one person farming, and a network
 * carrying eight is an office or a phone provider. It is a place to look.
 * Every action here is reversible and every one of them is written into the
 * audit log with the name of whoever pressed it.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const user = String(searchParams.get("user") || "").trim()

    // One patient, everything about them.
    if (user) {
      const [{ data: signals }, { data: row }] = await Promise.all([
        supabase.rpc("ward_patient_signals", { p_user: user }),
        supabase.from("users").select("id, email, display_name, created_at").eq("id", user).maybeSingle(),
      ])
      return NextResponse.json({ patient: row ?? null, signals: signals ?? null })
    }

    const { data: clusters } = await supabase.rpc("ward_clusters", { p_limit: 50 })

    // Names for every account named in a cluster, in one read. The lists carry
    // ids, and an id is useless to read on a screen.
    const ids = new Set<string>()
    for (const side of ["devices", "networks"] as const) {
      for (const c of (clusters as Record<string, unknown[]> | null)?.[side] ?? []) {
        for (const u of ((c as { users?: string[] })?.users ?? [])) ids.add(String(u))
      }
    }

    // Array.from rather than a spread: this repo's TypeScript target predates
    // iterating a Set directly, and a build that fails on a nicety is not
    // worth the nicety.
    const idList = Array.from(ids)

    const { data: people } = idList.length
      ? await supabase.from("users").select("id, email, display_name").in("id", idList)
      : { data: [] as { id: string; email: string | null; display_name: string | null }[] }

    const { data: flags } = idList.length
      ? await supabase.from("ward_flags").select("user_id, status, note").in("user_id", idList)
      : { data: [] as { user_id: string; status: string; note: string }[] }

    return NextResponse.json({
      clusters: clusters ?? { devices: [], networks: [] },
      people: people ?? [],
      flags: flags ?? [],
    })
  } catch (error) {
    console.error("[admin/abuse] GET failed:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const what = String(body?.what || "")
    const user = String(body?.user || "").trim()
    if (!user) return NextResponse.json({ error: "user required" }, { status: 400 })

    const supabase = await createAdminClient()

    if (what === "flag") {
      const status = String(body?.status || "")
      if (!["ok", "watch", "suspended"].includes(status)) {
        return NextResponse.json({ error: "status must be ok, watch or suspended" }, { status: 400 })
      }
      const { data } = await supabase.rpc("ward_patient_flag", {
        p_user: user,
        p_status: status,
        p_note: String(body?.note || "").slice(0, 400),
        p_by: session.username,
      })
      if (data?.ok !== true) return NextResponse.json({ error: "Could not set that." }, { status: 400 })

      await logAdminAction(supabase, request, session.username, "abuse.flag", { user, status })
      return NextResponse.json({ saved: true, status })
    }

    if (what === "void") {
      const { data } = await supabase.rpc("ward_void_doses", {
        p_user: user,
        p_reason: String(body?.reason || "").slice(0, 200),
      })
      await logAdminAction(supabase, request, session.username, "abuse.void", {
        user,
        voided: data?.voided ?? 0,
      })
      return NextResponse.json({ saved: true, voided: Number(data?.voided ?? 0) })
    }

    if (what === "restore") {
      const { data } = await supabase.rpc("ward_restore_doses", { p_user: user })
      await logAdminAction(supabase, request, session.username, "abuse.restore", {
        user,
        restored: data?.restored ?? 0,
      })
      return NextResponse.json({ saved: true, restored: Number(data?.restored ?? 0) })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    console.error("[admin/abuse] POST failed:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
