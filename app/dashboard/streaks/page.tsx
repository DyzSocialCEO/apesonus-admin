"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Flame, Shield, Loader2 } from "lucide-react"

export default function StreaksPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/streaks")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Streaks</h1>
        <p className="text-gray-400">7-day engagement streak tracking</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-orange-400/10">
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <p className="text-2xl font-bold text-white">{data?.activeStreaks || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Active Streaks</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-green-400/10">
              <Shield className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-white">{data?.verifiedUsers || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Verified Degens</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Streak Day Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-40">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const count = data?.dayDistribution?.[day] || 0
              const maxCount = Math.max(...Object.values(data?.dayDistribution || { 1: 1 }) as number[])
              const height = maxCount > 0 ? (count / maxCount) * 100 : 0
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs text-gray-400">{count}</span>
                  <div className="w-full rounded-t-lg bg-gray-800 relative" style={{ height: "100%" }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all"
                      style={{
                        height: `${Math.max(height, 4)}%`,
                        backgroundColor: day === 7 ? "#ffc847" : "#f97316",
                        opacity: 0.2 + (day / 7) * 0.8,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-white">D{day}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Top Streakers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">User</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Current Day</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Completed</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Last Check-in</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topStreakers || []).map((s: any) => (
                  <tr key={s.telegram_id} className="border-b border-gray-800/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium text-sm">
                          {s.user?.first_name || s.user?.username || s.telegram_id}
                        </p>
                        {s.user?.is_verified && (
                          <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px]">✓</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-orange-400 font-bold">{s.current_day}/7</span>
                    </td>
                    <td className="py-3 px-4 text-center text-white text-sm">
                      {s.completed_streaks} 🔥
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">Active</Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400 text-xs">
                      {s.last_checkin_date || "—"}
                    </td>
                  </tr>
                ))}
                {(!data?.topStreakers || data.topStreakers.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">No active streaks yet</td>
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
