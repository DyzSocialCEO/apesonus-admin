import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createAdminClient()

    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })

    const { data: playData } = await supabase
      .from("users")
      .select("tracks_played")

    const totalPlays = playData?.reduce((sum, u) => sum + (u.tracks_played || 0), 0) || 0

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      totalPlays,
    })
  } catch (error) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}
