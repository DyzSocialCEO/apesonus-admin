"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, Users, Zap, TrendingUp, Loader2, RefreshCw } from "lucide-react"

interface ArtistBackingStat {
  artistId: string
  artistName: string
  weekStart: string
  totalBackers: number
  totalOnusBacked: number
  momentum: string
  isGenesisWeek: boolean
}

interface WeeklySummary {
  totalBackers: number
  totalOnusBacked: number
  topArtist: string | null
  topArtistBackers: number
  genesisArtists: number
  weekStart: string
}

interface BackingData {
  summary: WeeklySummary
  artistStats: ArtistBackingStat[]
  recentBackings: Array<{
    telegramId: string
    artistId: string
    artistName: string
    tier: number
    onusSpent: number
    isGenesis: boolean
    createdAt: string
  }>
}

export default function BackingPage() {
  const [data, setData]       = useState<BackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<string>("")

  const fetchData = () => {
    setLoading(true)
    const url = selectedWeek
      ? `/api/admin/backing?week=${selectedWeek}`
      : "/api/admin/backing"
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [selectedWeek])

  const MOMENTUM_COLORS: Record<string, string> = {
    breakout: "text-yellow-400",
    rising:   "text-green-400",
    sleeper:  "text-purple-400",
    steady:   "text-gray-400",
    cooling:  "text-red-400",
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const summary = data?.summary
  const artistStats = data?.artistStats || []
  const recentBackings = data?.recentBackings || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Artist Backing</h1>
          <p className="text-gray-400">Track who the community is backing each week</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Week selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Week:</label>
        <input
          type="date"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
        />
        {selectedWeek && (
          <button
            onClick={() => setSelectedWeek("")}
            className="text-xs text-gray-500 hover:text-white"
          >
            Clear (current week)
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-yellow-400/10">
              <Users className="w-4 h-4 text-yellow-400" />
            </div>
            <p className="text-2xl font-bold text-white">{summary?.totalBackers ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">Total Backers</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-purple-400/10">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">{summary?.totalOnusBacked ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">$ONUS Backed</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-green-400/10">
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-sm font-bold text-white truncate">{summary?.topArtist ?? "—"}</p>
            <p className="text-xs text-gray-500 mt-1">Top Artist · {summary?.topArtistBackers ?? 0} backers</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg w-fit mb-2 bg-blue-400/10">
              <Star className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">{summary?.genesisArtists ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">Genesis Artists</p>
          </CardContent>
        </Card>
      </div>

      {/* Artist stats table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Artist Standings This Week</CardTitle>
        </CardHeader>
        <CardContent>
          {artistStats.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No backing data yet for this week.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Artist</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Backers</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">$ONUS</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Momentum</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Genesis</th>
                  </tr>
                </thead>
                <tbody>
                  {artistStats
                    .sort((a, b) => b.totalBackers - a.totalBackers)
                    .map((stat) => (
                      <tr key={stat.artistId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-3 text-white font-medium">{stat.artistName}</td>
                        <td className="py-3 px-3 text-right text-white">{stat.totalBackers}</td>
                        <td className="py-3 px-3 text-right text-yellow-400">{stat.totalOnusBacked}</td>
                        <td className={`py-3 px-3 text-right capitalize ${MOMENTUM_COLORS[stat.momentum] || "text-gray-400"}`}>
                          {stat.momentum}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {stat.isGenesisWeek ? (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                              Genesis
                            </Badge>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent backing activity */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Recent Backing Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBackings.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No recent backing activity.</p>
          ) : (
            <div className="space-y-2">
              {recentBackings.slice(0, 20).map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50">
                  <div>
                    <p className="text-sm text-white font-medium">{b.artistName}</p>
                    <p className="text-xs text-gray-500 font-mono">{b.telegramId.slice(0, 8)}…</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.isGenesis && (
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                        Genesis
                      </Badge>
                    )}
                    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">
                      T{b.tier} · {b.onusSpent} $ONUS
                    </Badge>
                    <span className="text-xs text-gray-600">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
