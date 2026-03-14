import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { awardOnus } from "@/lib/award-onus"
import { ONUS_SUPPLY } from "@/lib/constants/tiers"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // Get ALL users with ONUS (no limit — need real total)
    const { data: allUsers } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, total_onus, is_premium, verification_tier")
      .order("total_onus", { ascending: false })

    // Calculate real total distributed
    let totalDistributed = 0
    let usersWithPoints = 0
    let premiumUsers = 0
    if (allUsers) {
      for (const u of allUsers) {
        totalDistributed += (u.total_onus || 0)
        if ((u.total_onus || 0) > 0) usersWithPoints++
        if (u.is_premium) premiumUsers++
      }
    }

    // Top 100 leaderboard
    const leaderboard = (allUsers || []).filter(u => (u.total_onus || 0) > 0).slice(0, 100)

    // Recent transactions
    const { data: transactions } = await supabase
      .from("onus_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    // Daily burn rate (last 24h)
    const dayAgo = new Date(Date.now() - 86400000).toISOString()
    const { data: recentTxs } = await supabase
      .from("onus_transactions")
      .select("amount")
      .gt("amount", 0)
      .gte("created_at", dayAgo)

    let dailyBurn = 0
    if (recentTxs) {
      for (const tx of recentTxs) dailyBurn += tx.amount
    }

    const remaining = ONUS_SUPPLY.USER_POOL - totalDistributed
    const percentUsed = ((totalDistributed / ONUS_SUPPLY.USER_POOL) * 100).toFixed(4)

    return NextResponse.json({
      users: leaderboard,
      transactions: transactions || [],
      stats: {
        totalDistributed,
        remaining: Math.max(0, remaining),
        percentUsed,
        userPool: ONUS_SUPPLY.USER_POOL,
        totalSupply: ONUS_SUPPLY.TOTAL,
        teamReserve: ONUS_SUPPLY.TEAM_RESERVE,
        usersWithPoints,
        premiumUsers,
        totalUsers: allUsers?.length || 0,
        dailyBurn,
        estimatedDaysLeft: dailyBurn > 0 ? Math.round(remaining / dailyBurn) : null,
      },
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, amount, reason } = await request.json()
    if (!telegramId || !amount || !reason) {
      return NextResponse.json({ error: "telegramId, amount, and reason required" }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const ok = await awardOnus(supabase, telegramId, parseInt(amount), `admin_award: ${reason}`, `admin_${Date.now()}`)

    if (!ok) {
      return NextResponse.json({ error: "Award failed — supply cap may be reached or user not found" }, { status: 500 })
    }

    return NextResponse.json({ success: true, amountAwarded: amount })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
