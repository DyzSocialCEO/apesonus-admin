"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Loader2, User, CheckCircle, Flame, Coins } from "lucide-react"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      setUsers(data.users || [])
    } catch { } finally { setLoading(false) }
  }

  const handleAction = async (telegramId: string, action: string, amount?: number) => {
    setActing(telegramId)
    setMsg("")
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, action, amount }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(data.message)
        await fetchUsers()
      } else {
        setMsg(data.error || "Action failed")
      }
    } catch {
      setMsg("Failed to perform action")
    } finally { setActing(null) }
  }

  const filteredUsers = users.filter((user) => {
    const search = searchQuery.toLowerCase()
    return (
      user.username?.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.telegram_id?.includes(search)
    )
  })

  const verifiedCount = users.filter((u) => u.is_verified).length
  const activeStreakCount = users.filter((u) => u.streak?.is_active).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400">
          {users.length} total • {activeStreakCount} streaking • {verifiedCount} verified
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.includes("Failed") || msg.includes("failed") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
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
                    <th className="text-right py-4 px-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isVerified = user.is_verified
                    const hasStreak = user.streak?.is_active
                    const isActing = acting === user.telegram_id
                    return (
                      <tr key={user.telegram_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-white font-medium text-sm">
                                  {user.first_name || user.username || "Unknown"}
                                </p>
                                {isVerified && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                              </div>
                              <p className="text-xs text-gray-500">@{user.username || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-sm font-mono">{user.telegram_id}</td>
                        <td className="py-3 px-4 text-center">
                          {isVerified ? (
                            <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" /> VERIFIED
                            </Badge>
                          ) : hasStreak ? (
                            <Badge className="bg-orange-500/20 text-orange-400 border-0 text-xs">
                              <Flame className="w-3 h-3 mr-1" /> STREAKING
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">ACTIVE</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-white text-sm">{user.tracks_played || 0}</td>
                        <td className="py-3 px-4 text-center">
                          {hasStreak ? (
                            <span className="text-orange-400 font-bold text-sm">{user.streak.current_day}/7</span>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">{user.moji_points || 0}</td>
                        <td className="py-3 px-4 text-center text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleAction(user.telegram_id, "grant_coins", 50)}
                              disabled={isActing}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
                              title="Grant 50 coins"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => handleAction(user.telegram_id, isVerified ? "unverify_user" : "verify_user")}
                              disabled={isActing}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${
                                isVerified
                                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                  : "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"
                              }`}
                              title={isVerified ? "Remove verification" : "Verify user"}
                            >
                              <CheckCircle className="w-3 h-3" />
                            </button>
                          </div>
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
