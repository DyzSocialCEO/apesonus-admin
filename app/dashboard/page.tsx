import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Music, Play, TrendingUp, Activity, Crown } from "lucide-react"
import { formatNumber } from "@/lib/utils"
import { LiveSignups } from "@/components/live-signups"

/**
 * /dashboard, the admin home.
 *
 * Reads against the LIVE schema, not the legacy v1 columns. Source-of-truth
 * mapping established post-migration v3 (Supabase auth) and migration 045
 * (play_history canonical):
 *
 *   plays           → COUNT(*) FROM play_history
 *   active 7d       → DISTINCT user_id FROM play_history WHERE played_at >= now - 7d
 *   recent users    → users.{id, display_name, total_onus, created_at}
 *                     plays count via per-user count from play_history
 *                     streak via user_streaks.telegram_id (column kept legacy
 *                     name despite holding a UUID, handoff 6.1, do NOT rename)
 *
 * Previously read users.tracks_played and users.last_played_at directly.
 * Those columns exist (migration 010 added them) but the PWA no longer
 * writes to them, so every value is 0 / null. They're effectively dead.
 */

async function getStats() {
  try {
    const supabase = await createAdminClient()
    const nowIso = new Date().toISOString()
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()
    const today = nowIso.split("T")[0]

    // Total users
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })

    // Active in 7 days: distinct user_ids who played in the last week.
    // play_history has no aggregation RPC, so we pull the user_id column
    // and dedupe in JS. Cheap at expected scale.
    const { data: recentPlays } = await supabase
      .from("play_history")
      .select("user_id")
      .gte("played_at", sevenDaysAgoIso)
    const activeUsers = recentPlays
      ? new Set(recentPlays.map((p) => p.user_id)).size
      : 0

    // Total plays, counted from play_history.
    const { count: totalPlays } = await supabase
      .from("play_history")
      .select("*", { count: "exact", head: true })

    const { count: totalTracks } = await supabase
      .from("tracks")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)

    // The money, in the shape the clinic actually sells it. usd_cents is what
    // the order was worth; ammo_amount is a leftover column name from when the
    // only product was Spins and is not read here.
    const { data: purchases } = await supabase
      .from("pit_ammo_purchases")
      .select("user_id, usd_cents, status")
      .eq("status", "confirmed")
    let revenueCents = 0
    const payers = new Set<string>()
    for (const p of purchases || []) {
      revenueCents += Number(p.usd_cents || 0)
      if (p.user_id) payers.add(p.user_id)
    }
    const payingUsers = payers.size

    // The business, in one read each.
    const liveIso = new Date().toISOString()
    const [{ count: inpatients }, { count: casesBooked }, { count: delivered }, { count: onRecord }, { data: caseDoses }] =
      await Promise.all([
        supabase
          .from("ward_admissions")
          .select("*", { count: "exact", head: true })
          .eq("status", "active")
          .gt("expires_at", liveIso),
        supabase.from("ward_cases").select("*", { count: "exact", head: true }).neq("status", "awaiting_payment"),
        supabase.from("ward_cases").select("*", { count: "exact", head: true }).eq("status", "released"),
        supabase.from("ward_cases").select("*", { count: "exact", head: true }).not("published_at", "is", null),
        supabase.from("ward_case_sessions").select("state").not("dosed_at", "is", null),
      ])

    const qualified = (caseDoses ?? []).filter((r: any) => r.state === "qualified").length

    // Recent users
    const { data: recentUsers } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(8)

    const userIds = recentUsers?.map((u) => u.id) || []

    // Per-user play counts, one fetch grouped in JS. Avoids 8 round trips.
    const { data: playRows } = userIds.length
      ? await supabase
          .from("play_history")
          .select("user_id")
          .in("user_id", userIds)
      : { data: [] as { user_id: string }[] }

    const playCount = new Map<string, number>()
    for (const r of playRows || []) {
      playCount.set(r.user_id, (playCount.get(r.user_id) || 0) + 1)
    }

    // Per-user balances, kept for the recent patients table only.
    const { data: balRows } = userIds.length
      ? await supabase.from("pit_ammo_balances").select("user_id, balance").in("user_id", userIds)
      : { data: [] as any[] }
    const ammoBal = new Map<string, number>()
    for (const r of balRows || []) ammoBal.set(r.user_id, Number(r.balance || 0))
    const { data: embRows } = userIds.length
      ? await supabase.from("pit_embers").select("user_id, embers").in("user_id", userIds)
      : { data: [] as any[] }
    const embMap = new Map<string, number>()
    for (const r of embRows || []) embMap.set(r.user_id, Number(r.embers || 0))

    const enrichedUsers = (recentUsers || []).map((u) => ({
      id: u.id,
      display_name: u.display_name,
      email: u.email,
      avatar_url: u.avatar_url,
      created_at: u.created_at,
      plays: playCount.get(u.id) || 0,
      ammo: ammoBal.get(u.id) || 0,
      embers: embMap.get(u.id) || 0,
    }))

    return {
      totalUsers: totalUsers || 0,
      activeUsers,
      totalPlays: totalPlays || 0,
      totalTracks: totalTracks || 0,
      revenueCents,
      payingUsers,
      inpatients: inpatients || 0,
      casesBooked: casesBooked || 0,
      delivered: delivered || 0,
      onRecord: onRecord || 0,
      qualified,
      recentUsers: enrichedUsers,
    }
  } catch (error) {
    console.error("Error:", error)
    return {
      totalUsers: 0, activeUsers: 0, totalPlays: 0, totalTracks: 0,
      revenueCents: 0, payingUsers: 0, inpatients: 0, casesBooked: 0,
      delivered: 0, onRecord: 0, qualified: 0, recentUsers: [],
    }
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return "none"
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

export default async function DashboardPage() {
  const stats = await getStats()

  // The numbers that describe THIS business: who is admitted, what the desk
  // owes, what is on the record, and how much of the listening held up.
  const statCards = [
    { title: "Patients",          value: formatNumber(stats.totalUsers),   icon: Users,      color: "text-blue-400",   bg: "bg-blue-400/10" },
    { title: "Active (7d)",       value: formatNumber(stats.activeUsers),  icon: TrendingUp, color: "text-green-400",  bg: "bg-green-400/10" },
    { title: "Inpatients",        value: formatNumber(stats.inpatients),   icon: Crown,      color: "text-yellow-400", bg: "bg-yellow-400/10" },
    { title: "Admission revenue", value: `$${(stats.revenueCents / 100).toFixed(2)}`, icon: Activity, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { title: "Sessions booked",   value: formatNumber(stats.casesBooked),  icon: Music,      color: "text-primary",    bg: "bg-primary/10" },
    { title: "Prescriptions out", value: formatNumber(stats.delivered),    icon: Play,       color: "text-purple-400", bg: "bg-purple-400/10" },
    { title: "On the record",     value: formatNumber(stats.onRecord),     icon: Music,      color: "text-violet-400", bg: "bg-violet-400/10" },
    { title: "Qualified doses",   value: formatNumber(stats.qualified),    icon: TrendingUp, color: "text-green-400",  bg: "bg-green-400/10" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back to APESONUS Admin</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className={"p-2 rounded-lg w-fit mb-2 " + stat.bg}>
                <stat.icon className={"w-4 h-4 " + stat.color} />
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <LiveSignups />

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Recent Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left  py-3 px-4 text-sm font-medium text-gray-400">User</th>
                  <th className="text-left  py-3 px-4 text-sm font-medium text-gray-400">ID</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Plays</th>
                  <th className="text-right  py-3 px-4 text-sm font-medium text-gray-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user) => {
                  return (
                    <tr key={user.id} className="border-b border-gray-800/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-sm">
                            {user.display_name || user.email || "Unknown"}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">{user.email || "none"}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 font-mono">{shortId(user.id)}</td>
                      <td className="py-3 px-4 text-center text-white text-sm">{user.plays}</td>
                      <td className="py-3 px-4 text-right text-gray-400 text-xs">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
                {stats.recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">No users yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
