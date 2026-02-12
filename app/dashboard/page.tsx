import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Music, Play, TrendingUp, Activity, Flame } from "lucide-react"
import { formatNumber } from "@/lib/utils"

async function getStats() {
  try {
    const supabase = await createAdminClient()

    const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true })

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { count: activeUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("last_played_at", sevenDaysAgo)

    const { data: playData } = await supabase.from("users").select("tracks_played")
    const totalPlays = playData?.reduce((sum, u) => sum + (u.tracks_played || 0), 0) || 0

    const { count: totalTracks } = await supabase.from("tracks").select("*", { count: "exact", head: true }).eq("is_active", true)

    const today = new Date().toISOString().split("T")[0]
    const { count: todayVotes } = await supabase.from("daily_mood_votes").select("*", { count: "exact", head: true }).eq("vote_date", today)

    const { count: activeStreaks } = await supabase.from("user_streaks").select("*", { count: "exact", head: true }).eq("is_active", true)

    // Get recent users with streak info
    const { data: recentUsers } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, tracks_played, total_moji, created_at")
      .order("created_at", { ascending: false })
      .limit(8)

    // Get streaks for recent users
    const tids = recentUsers?.map((u) => u.telegram_id) || []
    const { data: streaks } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, is_active")
      .eq("is_active", true)
      .in("telegram_id", tids)

    const streakMap = new Map(streaks?.map((s) => [s.telegram_id, s]) || [])

    const enrichedUsers = (recentUsers || []).map((u) => ({
      ...u,
      streak: streakMap.get(u.telegram_id) || null,
    }))

    return {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalPlays,
      totalTracks: totalTracks || 0,
      todayVotes: todayVotes || 0,
      activeStreaks: activeStreaks || 0,
      recentUsers: enrichedUsers,
    }
  } catch (error) {
    console.error("Error:", error)
    return { totalUsers: 0, activeUsers: 0, totalPlays: 0, totalTracks: 0, todayVotes: 0, activeStreaks: 0, recentUsers: [] }
  }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    { title: "Total Users", value: formatNumber(stats.totalUsers), icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Active (7d)", value: formatNumber(stats.activeUsers), icon: TrendingUp, color: "text-green-400", bg: "bg-green-400/10" },
    { title: "Total Plays", value: formatNumber(stats.totalPlays), icon: Play, color: "text-purple-400", bg: "bg-purple-400/10" },
    { title: "Tracks", value: formatNumber(stats.totalTracks), icon: Music, color: "text-primary", bg: "bg-primary/10" },
    { title: "Pulse Today", value: formatNumber(stats.todayVotes), icon: Activity, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { title: "Active Streaks", value: formatNumber(stats.activeStreaks), icon: Flame, color: "text-orange-400", bg: "bg-orange-400/10" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back to STOKMOJI Admin</p>
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">User</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Plays</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Streak</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Moji</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user: any) => (
                  <tr key={user.telegram_id} className="border-b border-gray-800/50">
                    <td className="py-3 px-4">
                      <p className="text-white font-medium text-sm">{user.first_name || user.username || "Unknown"}</p>
                      <p className="text-xs text-gray-500">@{user.username || "—"}</p>
                    </td>
                    <td className="py-3 px-4 text-center text-white text-sm">{user.tracks_played || 0}</td>
                    <td className="py-3 px-4 text-center text-white text-sm">
                      {user.streak ? `${user.streak.current_day}/7` : "—"}
                    </td>
                    <td className="py-3 px-4 text-center text-primary text-sm">{user.total_moji || 0}</td>
                    <td className="py-3 px-4 text-right text-gray-400 text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {stats.recentUsers.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

Commit message: `fix admin dashboard — use total_moji, streak from user_streaks`

**Admin Fix 4:** In `app/dashboard/users/page.tsx`, find this one line:
```
<td className="py-3 px-4 text-center text-primary text-sm font-medium">{user.total_moji || 0}</td>
```

Replace with:
```
<td className="py-3 px-4 text-center text-primary text-sm font-medium">{user.total_moji || 0}</td>
```

Commit message: `fix admin users — display total_moji not dropped moji_points`

**Admin Fix 5:** In `app/dashboard/moji/page.tsx`, find these 3 lines:
```
{users.filter((u) => (u.moji_points || 0) > 0).map((user, i) => (
```
→ replace `moji_points` with `total_moji`
```
<td className="py-2 px-4 text-right text-primary font-bold text-sm">{user.moji_points}</td>
```
→ replace `moji_points` with `total_moji`
```
{users.filter((u) => (u.moji_points || 0) > 0).length === 0 && (
