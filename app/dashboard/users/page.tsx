"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Loader2, User } from "lucide-react"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error("Failed to load users:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter((user) => {
    const search = searchQuery.toLowerCase()
    return (
      user.username?.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.telegram_id?.includes(search)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400">Manage your user base</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search users..."
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
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">User</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Telegram ID</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Plays</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.telegram_id} className="border-b border-gray-800/50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              {user.first_name || user.username || "Unknown"}
                            </p>
                            <p className="text-sm text-gray-500">@{user.username || "no_username"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-400">{user.telegram_id}</td>
                      <td className="py-4 px-6 text-white">{user.tracks_played || 0}</td>
                      <td className="py-4 px-6 text-white">{user.current_streak || 0} days</td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-500">
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
