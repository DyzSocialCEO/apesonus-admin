"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, Loader2, User, Coins, Crown, RefreshCw,
} from "lucide-react"

/**
 * /dashboard/users — user roster + admin actions.
 *
 * Live-schema fields used:
 *   id              → primary key (Supabase auth UUID)
 *   email           → email address from auth provider
 *   display_name    → display name from auth metadata (nullable)
 *   avatar_url      → from auth provider (nullable)
 *   total_onus      → ONUS balance
 *   premium_status  → 'free' | 'active' | 'expired' (string enum, NOT bool)
 *   premium_expires_at
 *   verification_tier
 *   created_at
 *
 * Old fields (telegram_id, username, first_name, is_premium, tracks_played)
 * existed in v1 but are no longer written. Dropped from rendering.
 *
 * The POST action endpoint still accepts a `telegramId` field by historical
 * naming — the value is the user's UUID. We pass user.id straight through.
 */

interface AdminUser {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  total_onus: number | null
  premium_status: string | null
  premium_expires_at: string | null
  verification_tier: string | null
  created_at: string
  streak: { current_day: number; is_active: boolean; completed_streaks: number } | null
}

function isPremiumActive(u: AdminUser): boolean {
  return u.premium_status === "active"
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—"
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
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
    } catch { /* swallow */ } finally { setLoading(false) }
  }

  const handleAction = async (userId: string, action: string, amount?: number) => {
    setActing(`${userId}-${action}`)
    setMsg("")
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // POST endpoint accepts `telegramId` by legacy name; value is the UUID.
        body: JSON.stringify({ telegramId: userId, action, amount }),
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
    const search = searchQuery.toLowerCase().trim()
    if (!search) return true
    return (
      user.email?.toLowerCase().includes(search) ||
      user.display_name?.toLowerCase().includes(search) ||
      user.id?.toLowerCase().includes(search)
    )
  })

  const premiumCount = users.filter(isPremiumActive).length
  const activeStreakCount = users.filter((u) => u.streak?.is_active).length

  const tierBadge = (tier: string | null) => {
    if (!tier) return null
    const colors: Record<string, string> = {
      wagmi:    "bg-yellow-500/20 text-yellow-400",
      genesis:  "bg-yellow-500/20 text-yellow-400",
      free:     "bg-gray-500/20 text-gray-400",
      standard: "bg-gray-500/20 text-gray-400",
    }
    return (
      <Badge className={`${colors[tier] || "bg-gray-500/20 text-gray-400"} border-0 text-[10px]`}>
        {tier.toUpperCase()}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400">
            {users.length} total · {premiumCount} premium · {activeStreakCount} streaking
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            msg.startsWith("Error")
              ? "bg-red-500/10 text-red-400"
              : "bg-green-500/10 text-green-400"
          }`}
        >
          {msg}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name, email, or user ID..."
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
                    <th className="text-left   py-4 px-4 text-sm font-medium text-gray-400">User</th>
                    <th className="text-left   py-4 px-4 text-sm font-medium text-gray-400">User ID</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Tier</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Streak</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">$ONUS</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Joined</th>
                    <th className="text-right  py-4 px-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const premium = isPremiumActive(user)
                    const hasStreak = user.streak?.is_active
                    return (
                      <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={user.avatar_url}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover bg-gray-800"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                                <User className="w-4 h-4 text-gray-600" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-white font-medium text-sm">
                                  {user.display_name || user.email?.split("@")[0] || "Unknown"}
                                </p>
                                {premium && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                              </div>
                              <p className="text-xs text-gray-500">{user.email || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs font-mono" title={user.id}>
                          {shortId(user.id)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {premium ? (
                            <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">PREMIUM</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">FREE</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {tierBadge(user.verification_tier)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {hasStreak ? (
                            <span className="text-orange-400 font-bold text-sm">
                              {user.streak?.current_day ?? 0}/7
                            </span>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">
                          {user.total_onus || 0}
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleAction(user.id, "grant_coins", 100)}
                              disabled={acting !== null}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
                              title="Grant 100 $ONUS"
                            >
                              {acting === `${user.id}-grant_coins`
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Coins className="w-3 h-3" />}
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
