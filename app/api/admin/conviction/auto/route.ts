import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET → { auto: boolean }.  POST { on: boolean } → sets conviction_auto_daily. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await createAdminClient()
  const { data } = await supabase.from("app_settings").select("value").eq("key", "conviction_auto_daily").maybeSingle()
  return NextResponse.json({ auto: data?.value === "true" })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await request.json().catch(() => ({})) as { on?: boolean }
  const supabase = await createAdminClient()
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "conviction_auto_daily", value: b.on ? "true" : "false" }, { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ auto: !!b.on })
}
