import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * ADMISSION, the desk half.
 *
 * GET   the tiers as they stand, plus how many patients are inside a window
 * PATCH the whole tier list at once, and the publish rule
 *
 * The list here is the same list the database prices a purchase from, so a
 * tier switched off cannot be bought by anybody who kept the page open.
 */

interface Tier {
  key: string
  name: string
  days: number
  sessions: number
  cents: number
  active: boolean
}

const FALLBACK: Tier[] = [
  { key: "a7", name: "7 DAY ADMISSION", days: 7, sessions: 1, cents: 199, active: true },
  { key: "a30", name: "30 DAY ADMISSION", days: 30, sessions: 4, cents: 599, active: true },
  { key: "a90", name: "90 DAY ADMISSION", days: 90, sessions: 13, cents: 1499, active: true },
  { key: "a180", name: "180 DAY ADMISSION", days: 180, sessions: 26, cents: 2499, active: true },
]

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function readTiers(raw: unknown): { tiers: Tier[]; publishNeedsAdmission: boolean } {
  try {
    const v = raw && typeof raw === "object" ? (raw as any) : JSON.parse(String(raw ?? "{}"))
    const list = Array.isArray(v.tiers) ? v.tiers : []
    const tiers: Tier[] = list
      .map((t: any) => ({
        key: String(t?.key ?? "").trim(),
        name: String(t?.name ?? t?.key ?? "").trim(),
        days: num(t?.days, 7, 1, 3650),
        sessions: num(t?.sessions, 1, 1, 1000),
        cents: num(t?.cents, 199, 1, 1000000),
        active: t?.active !== false,
      }))
      .filter((t: Tier) => t.key.length > 0)
    return {
      tiers: tiers.length > 0 ? tiers : FALLBACK,
      publishNeedsAdmission: v.publish_needs_admission !== false,
    }
  } catch {
    return { tiers: FALLBACK, publishNeedsAdmission: true }
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [{ data: cfg }, { data: live }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "admission_config").maybeSingle(),
      supabase
        .from("ward_admissions")
        .select("id, tier_name, sessions_total, sessions_used, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString()),
    ])

    const read = readTiers(cfg?.value)
    const rows = live ?? []

    return NextResponse.json({
      ...read,
      present: cfg != null,
      admitted: rows.length,
      sessionsOutstanding: rows.reduce(
        (n: number, r: any) => n + Math.max(0, Number(r.sessions_total) - Number(r.sessions_used)),
        0,
      ),
    })
  } catch (e) {
    console.error("[admin/admission] GET failed:", e)
    return NextResponse.json({ error: "Could not read Admission." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admission_config")
      .maybeSingle()
    if (row == null) {
      return NextResponse.json(
        { error: "The admission_config row does not exist yet. Run 125_admission.sql first." },
        { status: 409 },
      )
    }

    const current = readTiers(row.value)
    const next = { ...current }

    if (Array.isArray(body?.tiers)) {
      const cleaned = readTiers({
        tiers: body.tiers,
        publish_needs_admission: current.publishNeedsAdmission,
      })
      // A key must stay unique, because a purchase is priced by key.
      const seen = new Set<string>()
      next.tiers = cleaned.tiers.filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)))
    }
    if ("publish_needs_admission" in body) {
      next.publishNeedsAdmission = body.publish_needs_admission !== false
    }

    if (next.tiers.length === 0) {
      return NextResponse.json({ error: "Leave at least one Admission on offer." }, { status: 400 })
    }

    const { error } = await supabase.from("app_settings").upsert(
      {
        key: "admission_config",
        value: JSON.stringify({
          tiers: next.tiers,
          publish_needs_admission: next.publishNeedsAdmission,
        }),
      },
      { onConflict: "key" },
    )
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "admission.settings", {
      before: current,
      after: next,
    })

    return NextResponse.json({ ...next, saved: true })
  } catch (e) {
    console.error("[admin/admission] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save Admission." }, { status: 500 })
  }
}
