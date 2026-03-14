"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Loader2, User, CheckCircle, Flame, Coins, Crown, XCircle, Shield, RefreshCw } from "lucide-react"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      setUsers(data.users || [])
    } catch { } finally { setLoading(false) }
  }

  const handleAction = async (telegramId: string, action: string, amount?: number) => {
    setActing(`${telegramId}-${action}`)
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
        setMsg(`Error: ${data.error || "Action failed"}`)
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

  const premiumCount = users.filter((u) => u.is_premium).length
  const activeStreakCount = users.filter((u) => u.streak?.is_active).length

  const tierBadge = (tier: string | null) => {
    if (!tier) return null
    const colors: Record<string, string> = {
      genesis: "bg-yellow-500/20 text-yellow-400",
      early: "bg-blue-500/20 text-blue-400",
      standard: "bg-gray-500/20 text-gray-400",
    }
    return (
      <Badge className={`${colors[tier] || "bg-gray-500/20 text-gray-400"} border-0 text-[10px]`}>
        {tier.toUpperCase()} {tier === "genesis" ? "3×" : tier === "early" ? "2×" : "1×"}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400">
            {users.length} total · {premiumCount} verified · {activeStreakCount} streaking
          </p>
        </div>
        <button onClick={fetchUsers} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
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
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">TG ID</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Tier</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Streak</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">$ONUS</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Joined</th>
                    <th className="text-right py-4 px-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isPremium = user.is_premium
                    const hasStreak = user.streak?.is_active

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
                                {isPremium && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                              </div>
                              <p className="text-xs text-gray-500">@{user.username || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs font-mono">{user.telegram_id}</td>
                        <td className="py-3 px-4 text-center">
                          {isPremium ? (
                            <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">VERIFIED</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">FREE</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {tierBadge(user.verification_tier)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {hasStreak ? (
                            <span className="text-orange-400 font-bold text-sm">{user.streak.current_day}/7</span>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">{user.total_onus || 0}</td>
                        <td className="py-3 px-4 text-center text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Grant ONUS */}
                            <button
                              onClick={() => handleAction(user.telegram_id, "grant_coins", 100)}
                              disabled={acting !== null}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
                              title="Grant 100 $ONUS"
                            >
                              {acting === `${user.telegram_id}-grant_coins`
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Coins className="w-3 h-3" />}
                            </button>

                            {/* Grant / Revoke Premium */}
                            {isPremium ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Revoke premium from ${user.first_name || user.telegram_id}? Card tier will be preserved.`)) {
                                    handleAction(user.telegram_id, "revoke_premium")
                                  }
                                }}
                                disabled={acting !== null}
                                className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50"
                                title="Revoke premium"
                              >
                                {acting === `${user.telegram_id}-revoke_premium`
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <XCircle className="w-3 h-3" />}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAction(user.telegram_id, "grant_premium")}
                                disabled={acting !== null}
                                className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 disabled:opacity-50"
                                title="Grant free premium"
                              >
                                {acting === `${user.telegram_id}-grant_premium`
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Shield className="w-3 h-3" />}
                              </button>
                            )}
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
