"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Crown, DollarSign, Users, Loader2, TrendingUp } from "lucide-react"

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, totalRevenue: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/subscriptions")
      .then((r) => r.json())
      .then((data) => {
        setSubs(data.subscriptions || [])
        setStats(data.stats || { total: 0, active: 0, totalRevenue: 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const statCards = [
    { title: "Total Subscriptions", value: stats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Active Premium", value: stats.active, icon: Crown, color: "text-primary", bg: "bg-primary/10" },
    { title: "Total Revenue", value: `$${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-green-400", bg: "bg-green-400/10" },
    { title: "MRR", value: `$${(stats.active * 3).toFixed(2)}`, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-400/10" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
        <p className="text-gray-400">Premium subscription management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.title} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className={"p-2 rounded-lg w-fit mb-2 " + s.bg}>
                <s.icon className={"w-4 h-4 " + s.color} />
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : subs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No subscriptions yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">User</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Method</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Amount</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Started</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-3 px-4">
                        <p className="text-white text-sm font-medium">
                          {sub.user?.first_name || sub.user?.username || sub.telegram_id}
                        </p>
                        <p className="text-xs text-gray-500">@{sub.user?.username || "—"}</p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={sub.status === "active" ? "bg-green-500/20 text-green-400 border-0" : "bg-gray-700/50 text-gray-400 border-0"}>
                          {sub.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-400 text-xs">
                        {sub.payment_method || "—"}
                      </td>
                      <td className="py-3 px-4 text-center text-white text-sm">
                        ${(sub.amount_paid || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-500 text-xs">
                        {sub.started_at ? new Date(sub.started_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-500 text-xs">
                        {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-800/30 border-gray-800">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500">
            💡 To grant or remove premium for a specific user, go to the <a href="/dashboard/users" className="text-primary hover:underline">Users</a> page and use the Grant/Remove button.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
