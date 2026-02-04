import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Music, Play, TrendingUp } from "lucide-react"
import { formatNumber } from "@/lib/utils"

async function getStats() {
  try {
    const supabase = await createAdminClient()

    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { count: activeUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("last_played_at", sevenDaysAgo.toISOString())

    const { data: playData } = await supabase
      .from("users")
      .select("tracks_played")

    const totalPlays = playData?.reduce((sum, user) => sum + (user.tracks_played || 0), 0) || 0

    const { data: recentUsers } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, tracks_played, current_streak, created_at")
      .order("created_at", { ascending: false })
      .limit(5)

    return {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalPlays,
      recentUsers: recentUsers || [],
    }
  } catch (error) {
    console.error("Error fetching stats:", error)
    return {
      totalUsers: 0,
      activeUsers: 0,
      totalPlays: 0,
      recentUsers: [],
    }
  }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    {
      title: "Total Users",
      value: formatNumber(stats.totalUsers),
      icon: Users,
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      title: "Active Users (7d)",
      value: formatNumber(stats.activeUsers),
      icon: TrendingUp,
      color: "text-green-400",
      bgColor: "bg-green-400/10",
    },
    {
      title: "Total Plays",
      value: formatNumber(stats.totalPlays),
      icon: Play,
      color: "text-purple-400",
      bgColor: "bg-purple-400/10",
    },
    {
      title: "Tracks",
      value: "10",
      icon: Music,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back to STOKMOJI Admin</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-gray-900 border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{stat.title}</p>
                  <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={"p-3 rounded-xl " + stat.bgColor}>
                  <stat.icon className={"w-6 h-6 " + stat.color} />
                </div>
              </div>
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Plays</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Streak</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user: any) => (
                  <tr key={user.telegram_id} className="border-b border-gray-800/50">
                    <td className="py-3 px-4">
                      <p className="text-white font-medium">
                        {user.first_name || user.username || "Unknown"}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-white">{user.tracks_played || 0}</td>
                    <td className="py-3 px-4 text-white">{user.current_streak || 0} days</td>
                    <td className="py-3 px-4 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {stats.recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No users yet
                    </td>
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
