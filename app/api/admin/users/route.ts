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

    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
