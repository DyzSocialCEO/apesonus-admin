import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Music, Play, TrendingUp, Activity, Crown } from "lucide-react"
import { formatNumber } from "@/lib/utils"

/**
 * /dashboard — main admin home.
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
 *                     name despite holding a UUID — handoff §6.1, do NOT rename)
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

    // Active (7d) — distinct user_ids who played in the last 7 days.
    // play_history has no aggregation RPC, so we pull the user_id column
    // and dedupe in JS. Cheap at expected scale.
    const { data: recentPlays } = await supabase
      .from("play_history")
      .select("user_id")
      .gte("played_at", sevenDaysAgoIso)
    const activeUsers = recentPlays
      ? new Set(recentPlays.map((p) => p.user_id)).size
      : 0

    // Total plays — count of rows in play_history.
    const { count: totalPlays } = await supabase
      .from("play_history")
      .select("*", { count: "exact", head: true })

    const { count: totalTracks } = await supabase
      .from("tracks")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)

    const { count: todayVotes } = await supabase
      .from("market_sentiment_votes")
      .select("*", { count: "exact", head: true })
      .eq("vote_date", today)

    // Genesis cardholders — replaces the old "Active Streaks" card.
    // PWA has no streak feature on the front (handoff §6).
    const { count: genesisHolders } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("is_genesis_holder", true)

    // Recent users
    const { data: recentUsers } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, total_onus, created_at, premium_status, is_genesis_holder")
      .order("created_at", { ascending: false })
      .limit(8)

    const userIds = recentUsers?.map((u) => u.id) || []

    // Per-user play counts — single fetch, group in JS. Avoids 8 round trips.
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

    const enrichedUsers = (recentUsers || []).map((u) => ({
      id: u.id,
      display_name: u.display_name,
      email: u.email,
      avatar_url: u.avatar_url,
      total_onus: u.total_onus,
      created_at: u.created_at,
      premium_status: u.premium_status,
      is_genesis_holder: u.is_genesis_holder,
      plays: playCount.get(u.id) || 0,
    }))

    return {
      totalUsers: totalUsers || 0,
      activeUsers,
      totalPlays: totalPlays || 0,
      totalTracks: totalTracks || 0,
      todayVotes: todayVotes || 0,
      genesisHolders: genesisHolders || 0,
      recentUsers: enrichedUsers,
    }
  } catch (error) {
    console.error("Error:", error)
    return {
      totalUsers: 0, activeUsers: 0, totalPlays: 0, totalTracks: 0,
      todayVotes: 0, genesisHolders: 0, recentUsers: [],
    }
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—"
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    { title: "Total Users",    value: formatNumber(stats.totalUsers),    icon: Users,      color: "text-blue-400",   bg: "bg-blue-400/10" },
    { title: "Active (7d)",    value: formatNumber(stats.activeUsers),   icon: TrendingUp, color: "text-green-400",  bg: "bg-green-400/10" },
    { title: "Total Plays",    value: formatNumber(stats.totalPlays),    icon: Play,       color: "text-purple-400", bg: "bg-purple-400/10" },
    { title: "Tracks",         value: formatNumber(stats.totalTracks),   icon: Music,      color: "text-primary",    bg: "bg-primary/10" },
    { title: "Pulse Today",    value: formatNumber(stats.todayVotes),    icon: Activity,   color: "text-cyan-400",   bg: "bg-cyan-400/10" },
    { title: "Genesis Holders", value: formatNumber(stats.genesisHolders), icon: Crown,      color: "text-yellow-400", bg: "bg-yellow-400/10" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back to APESONUS Admin</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Tier</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">$ONUS</th>
                  <th className="text-right  py-3 px-4 text-sm font-medium text-gray-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user) => {
                  const tier = user.premium_status === "genesis"
                    ? "GENESIS"
                    : user.premium_status === "standard"
                    ? "STANDARD"
                    : "FREE"
                  const tierColor = user.premium_status === "genesis"
                    ? "text-yellow-400"
                    : user.premium_status === "standard"
                    ? "text-blue-400"
                    : "text-gray-500"
                  return (
                    <tr key={user.id} className="border-b border-gray-800/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-sm">
                            {user.display_name || user.email || "Unknown"}
                          </p>
                          {!!user.is_genesis_holder && (
                            <Crown className="w-3 h-3 text-yellow-400" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{user.email || "—"}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 font-mono">{shortId(user.id)}</td>
                      <td className="py-3 px-4 text-center text-white text-sm">{user.plays}</td>
                      <td className={`py-3 px-4 text-center text-xs font-bold ${tierColor}`}>{tier}</td>
                      <td className="py-3 px-4 text-center text-primary text-sm">{user.total_onus || 0}</td>
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
