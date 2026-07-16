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
 *   premium_status  → 'none' | 'standard' | 'genesis' (canonical tier;
 *                     constraint from migration v2_001)
 *   is_genesis_holder → permanent card flag (true forever once minted)
 *   genesis_active  → 3x weight toggle (cardholder + most-recent purchase $5+)
 *   created_at
 *
 * Tier label rule (matches the PWA's source of truth):
 *   premium_status === 'genesis'   → GENESIS  (cardholder with active 3x)
 *   premium_status === 'standard'  → STANDARD (paid, 2x cap)
 *   premium_status === 'none'      → FREE
 *
 * Legacy verification_tier column is intentionally NOT read here. It has
 * a stricter CHECK constraint ('free'|'wagmi'|'chad'|'whale') that the
 * payment flow can't write 'genesis'/'standard' to, so it's always
 * stale. premium_status is the canonical source.
 */

interface AdminUser {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  total_onus: number | null
  premium_status: string | null
  is_genesis_holder: boolean | null
  genesis_active: boolean | null
  has_paid: boolean | null
  ammo: number | null
  embers: number | null
  created_at: string
}

function isPaid(u: AdminUser): boolean {
  // Paid = has ever made a confirmed purchase.
  return !!u.has_paid
}

function embersTier(e: number): { label: string; cls: string } {
  if (e >= 1000) return { label: "DIAMOND", cls: "bg-cyan-500/20 text-cyan-300" }
  if (e >= 200) return { label: "DEGEN", cls: "bg-pink-500/20 text-pink-400" }
  if (e >= 50) return { label: "BELIEVER", cls: "bg-yellow-500/20 text-yellow-400" }
  if (e >= 10) return { label: "BACKER", cls: "bg-lime-500/20 text-lime-400" }
  return { label: "SCOUT", cls: "bg-gray-500/20 text-gray-400" }
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

  const paidCount = users.filter(isPaid).length

  /**
   * Tier badge driven by Embers, with one gate in front of it.
   *
   * Never paid means FREE, muted, regardless of Ember count. The Ember
   * tiers only carry meaning for payers: an Ember is the receipt for a
   * paid play (migration 058 gates the mint on a confirmed purchase), so
   * a tier badge on a non-payer would be describing something they never
   * bought.
   *
   * NOTE: the previous comment here described a premium_status/Genesis
   * badge system with STANDARD and gold-card labels. That code is long
   * gone and the comment was left behind describing behavior that did not
   * exist. If this badge changes again, change these words with it.
   */
  const tierBadge = (user: AdminUser) => {
    if (!isPaid(user)) {
      return <Badge className="bg-gray-500/20 text-gray-500 border-0 text-[10px]">FREE</Badge>
    }
    const t = embersTier(user.embers || 0)
    return <Badge className={`${t.cls} border-0 text-[10px]`}>{t.label}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400">
            {users.length} total · {paidCount} paid
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
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Tier</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Embers</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Spins</th>
                    <th className="text-right  py-4 px-4 text-sm font-medium text-gray-400">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const paid = isPaid(user)
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
                              </div>
                              <p className="text-xs text-gray-500">{user.email || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs font-mono" title={user.id}>
                          {shortId(user.id)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {tierBadge(user)}
                        </td>
                        <td className="py-3 px-4 text-center text-sm font-medium">
                          {/*
                            Red means a non-payer is holding Embers, which
                            should be impossible after migration 058 gated the
                            mint on a confirmed purchase. If this ever lights
                            up, the gate has failed and the airdrop basis is
                            being diluted. Leave the canary in.
                          */}
                          <span
                            className={
                              !paid && (user.embers || 0) > 0
                                ? "text-red-400"
                                : "text-gray-300"
                            }
                            title={
                              !paid && (user.embers || 0) > 0
                                ? "Non-payer holding Embers. The 058 gate should prevent this."
                                : undefined
                            }
                          >
                            {(user.embers || 0).toLocaleString("en-US")}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">
                          {(user.ammo || 0).toLocaleString("en-US")}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">
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
