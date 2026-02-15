"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users, Play, TrendingUp, Activity, Flame, Music, Share2, Loader2,
} from "lucide-react"

const MOOD_COLORS: Record<string, string> = {
  moon: "#22c55e", rekt: "#ef4444", cope: "#f97316", degen: "#a855f7", zen: "#06b6d4",
}

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/analytics")
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

  if (!data) return <p className="text-gray-500">Failed to load analytics</p>

  const statCards = [
    { title: "Total Users", value: data.totalUsers, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Active (7d)", value: data.activeUsers, icon: Activity, color: "text-green-400", bg: "bg-green-400/10" },
    { title: "New (7d)", value: data.newUsers, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { title: "Total Plays", value: data.totalPlays, icon: Play, color: "text-purple-400", bg: "bg-purple-400/10" },
    { title: "Pulse Today", value: data.todayVotes, icon: Activity, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { title: "Active Streaks", value: data.activeStreaks, icon: Flame, color: "text-orange-400", bg: "bg-orange-400/10" },
    { title: "Active Tracks", value: data.totalTracks, icon: Music, color: "text-pink-400", bg: "bg-pink-400/10" },
    { title: "Referrals", value: data.totalReferrals, icon: Share2, color: "text-orange-400", bg: "bg-orange-400/10" },
  ]

  const totalMoodPlays = Object.values(data.moodBreakdown as Record<string, number>).reduce((a: number, b: number) => a + b, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400">Real-time app performance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood Breakdown */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Mood Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.moodBreakdown as Record<string, number>).map(([mood, count]) => {
                const pct = totalMoodPlays > 0 ? ((count as number) / totalMoodPlays) * 100 : 0
                return (
                  <div key={mood}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium uppercase">{mood}</span>
                      <span className="text-xs text-gray-400">{count as number} plays ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: MOOD_COLORS[mood] || "#666" }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Tracks */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Top Tracks</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topTracks.length === 0 ? (
              <p className="text-gray-500 text-sm">No play data yet</p>
            ) : (
              <div className="space-y-3">
                {data.topTracks.map((track: any, i: number) => (
                  <div key={track.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-lg font-bold" style={{ color: i === 0 ? "#ffc847" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#666" }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{track.title}</p>
                      <p className="text-xs text-gray-500">{track.artist}</p>
                    </div>
                    <span className="text-sm text-primary font-bold">{track.play_count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
