import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE VOICES.
 *
 * GET   every therapist with their character block, the model settings, and
 *       what the conversation has cost in the last day
 * PATCH the model settings
 * POST  one therapist's character block, by id
 *
 * The house block is not here and is not editable anywhere. It lives in the
 * app beside the model call and holds the three things that must be true in
 * every session: it is entertainment, it is never financial advice, and a
 * patient in real trouble gets a person rather than a joke.
 */

export interface AiSettings {
  model: string
  fallback_model: string
  max_exchanges: number
  max_reply_chars: number
  daily_spend_cap_cents: number
  kill_switch: boolean
  max_refusals: number
}

const FALLBACK: AiSettings = {
  model: "claude-haiku-4-5-20251001",
  fallback_model: "claude-haiku-4-5-20251001",
  max_exchanges: 4,
  max_reply_chars: 420,
  daily_spend_cap_cents: 500,
  kill_switch: false,
  max_refusals: 3,
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function read(raw: unknown): AiSettings {
  try {
    const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : JSON.parse(String(raw ?? "{}"))
    return {
      model: String(v.model || FALLBACK.model),
      fallback_model: String(v.fallback_model || FALLBACK.fallback_model),
      max_exchanges: num(v.max_exchanges, FALLBACK.max_exchanges, 1, 20),
      max_reply_chars: num(v.max_reply_chars, FALLBACK.max_reply_chars, 80, 2000),
      daily_spend_cap_cents: num(v.daily_spend_cap_cents, FALLBACK.daily_spend_cap_cents, 0, 1000000),
      kill_switch: v.kill_switch === true,
      max_refusals: num(v.max_refusals, FALLBACK.max_refusals, 1, 20),
    }
  } catch {
    return { ...FALLBACK }
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [{ data: cfg }, { data: staff }, { data: spent }, { data: recent }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "therapist_ai").maybeSingle(),
      supabase.from("ward_therapists").select("id, name, bio, prompt, active, sort").order("sort"),
      supabase.rpc("ward_ai_spend_today"),
      supabase
        .from("ward_cases")
        .select("id, patient_no, exchanges, ai_tokens, ai_cost_micro, refusals, flagged, created_at")
        .gt("exchanges", 0)
        .order("created_at", { ascending: false })
        .limit(20),
    ])

    return NextResponse.json({
      settings: read(cfg?.value),
      present: cfg != null,
      therapists: (staff ?? []).map((t: any) => ({
        id: Number(t.id),
        name: String(t.name || ""),
        bio: String(t.bio || ""),
        prompt: String(t.prompt || ""),
        active: t.active === true,
      })),
      spentTodayCents: Number(spent ?? 0),
      recent: recent ?? [],
    })
  } catch (e) {
    console.error("[admin/voices] GET failed:", e)
    return NextResponse.json({ error: "Could not read the voices." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings").select("value").eq("key", "therapist_ai").maybeSingle()
    if (row == null) {
      return NextResponse.json(
        { error: "The therapist_ai row does not exist yet. Run 120_the_conversation.sql first." },
        { status: 409 },
      )
    }

    const current = read(row.value)
    const next: AiSettings = { ...current }

    if ("model" in body) next.model = String(body.model || "").trim() || current.model
    if ("fallback_model" in body) next.fallback_model = String(body.fallback_model || "").trim() || current.fallback_model
    if ("max_exchanges" in body) next.max_exchanges = num(body.max_exchanges, current.max_exchanges, 1, 20)
    if ("max_reply_chars" in body) next.max_reply_chars = num(body.max_reply_chars, current.max_reply_chars, 80, 2000)
    if ("daily_spend_cap_cents" in body)
      next.daily_spend_cap_cents = num(body.daily_spend_cap_cents, current.daily_spend_cap_cents, 0, 1000000)
    if ("max_refusals" in body) next.max_refusals = num(body.max_refusals, current.max_refusals, 1, 20)
    if ("kill_switch" in body) next.kill_switch = body.kill_switch === true

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "therapist_ai", value: JSON.stringify(next) }, { onConflict: "key" })
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "voices.settings", { before: current, after: next })
    return NextResponse.json({ settings: next, saved: true })
  } catch (e) {
    console.error("[admin/voices] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save the settings." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const id = Math.floor(Number(body?.id))
    if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "Which therapist?" }, { status: 400 })

    const prompt = String(body?.prompt ?? "").slice(0, 8000)
    const supabase = await createAdminClient()
    const { error } = await supabase.from("ward_therapists").update({ prompt }).eq("id", id)
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "voices.prompt", { id, length: prompt.length })
    return NextResponse.json({ saved: true })
  } catch (e) {
    console.error("[admin/voices] POST failed:", e)
    return NextResponse.json({ error: "Could not save that voice." }, { status: 500 })
  }
}
