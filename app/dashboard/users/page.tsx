"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, Loader2, User, Coins, Crown, RefreshCw,
} from "lucide-react"

/**
 * /dashboard/users, the patient roster.
 *
 * WHAT A PATIENT IS DURING BETA. Nothing is being sold, so tiers, Spins and
 * Embers described an economy the app no longer has: a payment badge on a
 * product that takes no payments is a label for a thing that cannot happen.
 * This reads what the clinic actually does now.
 *
 *   doses      lifetime finished listens
 *   devices    machines this file has been opened on
 *   standing   ok, watch or suspended, set on the Who looks like who desk
 *   last dose  when they were last here
 *
 * The payment columns on the users table are still selected below, because
 * they are still in the schema and the day Admission comes back this panel
 * will want them again. They are simply not drawn.
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
  doses: number | null
  devices: number | null
  flag: string | null
  lastDose: string | null
  created_at: string
}

/** How long ago, in words a person reads rather than a timestamp. */
function ago(iso: string | null | undefined): string {
  if (!iso) return "never"
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function shortId(id: string | null | undefined): string {
  if (!id) return ","
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


  /**
   * The only badge left. Nothing is being sold, so a payment tier described a
   * thing that does not exist; what matters about a patient now is whether
   * anybody has had cause to look at them twice.
   */
  const flagBadge = (user: AdminUser) => {
    const f = user.flag || "ok"
    if (f === "suspended") {
      return <Badge className="bg-red-500/20 text-red-400 border-0 text-[10px]">SUSPENDED</Badge>
    }
    if (f === "watch") {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-0 text-[10px]">WATCH</Badge>
    }
    return <Badge className="bg-gray-500/20 text-gray-500 border-0 text-[10px]">OK</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400">
            {users.length} patients
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
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Standing</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Doses</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Devices</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Last dose</th>
                    <th className="text-right  py-4 px-4 text-sm font-medium text-gray-400">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
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
                              <p className="text-xs text-gray-500">{user.email || ","}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs font-mono" title={user.id}>
                          {shortId(user.id)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {flagBadge(user)}
                        </td>
                        <td className="py-3 px-4 text-center text-primary text-sm font-medium">
                          {(user.doses || 0).toLocaleString("en-US")}
                        </td>
                        <td className="py-3 px-4 text-center text-sm">
                          {/* More than a couple of machines on one file is not
                              proof of anything, but it is the first thing worth
                              noticing about a patient. */}
                          <span className={(user.devices || 0) > 2 ? "text-yellow-400" : "text-gray-400"}>
                            {user.devices || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500 text-xs">
                          {ago(user.lastDose)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
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
