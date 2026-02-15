"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Loader2 } from "lucide-react"

const MOOD_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  moon: { emoji: "🚀", color: "#22c55e", label: "MOON" },
  rekt: { emoji: "💀", color: "#ef4444", label: "REKT" },
  cope: { emoji: "😐", color: "#f97316", label: "COPE" },
  degen: { emoji: "🐒", color: "#a855f7", label: "DEGEN" },
  zen: { emoji: "🧘", color: "#06b6d4", label: "ZEN" },
}

export default function PulsePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/pulse")
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

  const todayTotal = data?.today?.total || 0
  const breakdown = data?.today?.breakdown || {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Culture Pulse</h1>
        <p className="text-gray-400">Real-time mood sentiment from the degen community</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-cyan-400/10">
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-2xl font-bold text-white">{todayTotal}</p>
            <p className="text-xs text-gray-500 mt-1">Votes Today</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-2">Total All-Time Voters</p>
            <p className="text-2xl font-bold text-white">{data?.totalVoters || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Today&apos;s Mood Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(MOOD_CONFIG).map(([mood, config]) => {
              const count = breakdown[mood] || 0
              const pct = todayTotal > 0 ? Math.round((count / todayTotal) * 100) : 0
              return (
                <div key={mood}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.emoji}</span>
                      <span className="text-sm font-medium text-white">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{count} votes</span>
                      <span className="text-sm font-bold" style={{ color: config.color }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ backgroundColor: config.color, width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">7-Day Mood Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.weekTrend && Object.keys(data.weekTrend).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-xs text-gray-500">Date</th>
                    {Object.entries(MOOD_CONFIG).map(([mood, config]) => (
                      <th key={mood} className="text-center py-2 px-3 text-xs">
                        <span>{config.emoji}</span>
                      </th>
                    ))}
                    <th className="text-right py-2 px-3 text-xs text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.weekTrend as Record<string, Record<string, number>>)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, moods]) => {
                      const dayTotal = Object.values(moods).reduce((a, b) => a + b, 0)
                      return (
                        <tr key={date} className="border-b border-gray-800/50">
                          <td className="py-2 px-3 text-sm text-gray-400">{new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                          {Object.keys(MOOD_CONFIG).map((mood) => (
                            <td key={mood} className="py-2 px-3 text-center text-sm text-white">{moods[mood] || 0}</td>
                          ))}
                          <td className="py-2 px-3 text-right text-sm font-bold text-white">{dayTotal}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
