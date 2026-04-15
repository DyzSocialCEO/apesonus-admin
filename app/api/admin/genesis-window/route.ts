import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const WINDOW_DAYS = 45

interface GenesisWindow {
  started_at: string | null
  closed: boolean
}

async function readWindow(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<GenesisWindow> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "genesis_window")
    .maybeSingle()

  if (!data?.value) return { started_at: null, closed: false }
  // value column may be jsonb (returns object) or text (returns string)
  if (typeof data.value === "string") {
    try { return JSON.parse(data.value) as GenesisWindow } catch { return { started_at: null, closed: false } }
  }
  return data.value as GenesisWindow
}

function computeStatus(w: GenesisWindow) {
  if (!w.started_at) {
    return {
      state: "not_started" as const,
      startedAt: null,
      endsAt: null,
      daysRemaining: null,
      closed: false,
    }
  }
  const start = new Date(w.started_at)
  const end = new Date(start.getTime() + WINDOW_DAYS * 86400000)
  const now = new Date()
  const msLeft = end.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(msLeft / 86400000))
  const expired = msLeft <= 0

  return {
    state: w.closed || expired ? ("expired" as const) : ("active" as const),
    startedAt: start.toISOString(),
    endsAt: end.toISOString(),
    daysRemaining,
    closed: w.closed || expired,
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const window = await readWindow(supabase)

    // Count current Genesis badges for context
    const { count } = await supabase
      .from("users")
      .select("telegram_id", { count: "exact", head: true })
      .eq("genesis_badge", true)

    return NextResponse.json({
      ...computeStatus(window),
      windowDays: WINDOW_DAYS,
      genesisBadgeCount: count || 0,
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { action } = await request.json()
    const supabase = await createAdminClient()
    const current = await readWindow(supabase)

    if (action === "start") {
      if (current.started_at) {
        return NextResponse.json({ error: "Window already started" }, { status: 409 })
      }
      const next: GenesisWindow = { started_at: new Date().toISOString(), closed: false }
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: "genesis_window", value: next as any, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, ...computeStatus(next) })
    }

    if (action === "close") {
      if (!current.started_at) {
        return NextResponse.json({ error: "Window has not started" }, { status: 400 })
      }
      const next: GenesisWindow = { started_at: current.started_at, closed: true }
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: "genesis_window", value: next as any, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, ...computeStatus(next) })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
