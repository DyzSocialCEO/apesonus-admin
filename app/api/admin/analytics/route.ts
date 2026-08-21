import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const days = Math.max(1, Math.min(365, Math.floor(Number(searchParams.get("days") ?? 7)) || 7))

    // ONE READ, COUNTED IN THE DATABASE. The previous version pulled every
    // play row of the window through the API and counted them here, which
    // stops at 1000 rows: the busier the clinic got, the more wrong this desk
    // became, silently. It also ranked tracks by a play counter that loses
    // counts under load and drew a condition breakdown from a table nothing
    // has written to in months. All three now come from ward_doses, the same
    // rows the Chart and the Diagnosis count.
    const { data, error } = await supabase.rpc("ward_analytics", { p_days: days })
    if (error) throw error

    const d = (data ?? {}) as Record<string, any>

    return NextResponse.json({
      days,
      totalUsers: Number(d.patients ?? 0) || 0,
      activeUsers: Number(d.activePatients ?? 0) || 0,
      newUsers: Number(d.newPatients ?? 0) || 0,
      dosesWindow: Number(d.dosesWindow ?? 0) || 0,
      dosesTotal: Number(d.dosesTotal ?? 0) || 0,
      prescriptions: Number(d.prescriptions ?? 0) || 0,
      therapists: Number(d.therapists ?? 0) || 0,
      topTracks: Array.isArray(d.topTracks) ? d.topTracks : [],
      moodBreakdown: (d.conditions ?? {}) as Record<string, number>,
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
