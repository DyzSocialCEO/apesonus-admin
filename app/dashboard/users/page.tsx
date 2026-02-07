"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Loader2, User, Crown, CrownIcon, ShieldOff } from "lucide-react"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [toggling, setToggling] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      setUsers(data.users || [])
    } catch { } finally { setLoading(false) }
  }

  const togglePremium = async (telegramId: string, isPremium: boolean) => {
    setToggling(telegramId)
    setMsg("")
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          action: isPremium ? "deactivate_premium" : "activate_premium",
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(data.message)
        await fetchUsers()
      }
    } catch {
      setMsg("Failed to toggle premium")
    } finally { setToggling(null) }
  }

  const filteredUsers = users.filter((user) => {
    const search = searchQuery.toLowerCase()
    return (
      user.username?.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.telegram_id?.includes(search)
    )
  })

  const premiumCount = users.filter((u) => u.subscription?.status === "active").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400">
          {users.length} total users • {premiumCount} premium
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.includes("Failed") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {msg}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name, username, or Telegram ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">User</th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">Telegram ID</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Plays</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Streak</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Moji</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Joined</th>
                    <th className="text-right py-4 px-4 text-sm font-medium text-gray-400">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isPremium = user.subscription?.status === "active"
                    const isToggling = toggling === user.telegram_id
                    return (
                      <tr key={user.telegram_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-600" />
                            </div>
                            <div>
                              <p className="text-white font-medium text-sm">
                                {user.first_name || user.username || "Unknown"}
                              </p>
                              <p className="text-xs text-gray-500">@{user.username || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-sm font-mono">{user.telegram_id}</td>
                        <td className="py-3 px-4 text-center">
                          {isPremium ? (
                            <Badge className="bg-primary/20 text-primary border-0 text-xs">
                              <Crown className="w-3 h-3 mr-1" /> PREMIUM
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">FREE</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-white text-sm">{user.tracks_played || 0}</td>
                        <td className="py-3 px-4 text-center text-white text-sm">{user.current_streak || 0}d</td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">{user.moji_points || 0}</td>
                        <td className="py-3 px-4 text-center text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => togglePremium(user.telegram_id, isPremium)}
                            disabled={isToggling}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isPremium
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                            } disabled:opacity-50`}
                          >
                            {isToggling ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isPremium ? (
                              "Remove"
                            ) : (
                              "Grant"
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        {searchQuery ? "No users match your search" : "No users yet"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
