"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Target,
  Loader2,
  Play,
  Trophy,
  Users,
  Coins,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react"

const MOOD_EMOJIS: Record<string, string> = {
  moon: "🟢", rekt: "🔴", cope: "😤", degen: "🎰", zen: "🧘",
}

const MOOD_LABELS: Record<string, string> = {
  moon: "MOON", rekt: "REKT", cope: "COPE", degen: "DEGEN", zen: "ZEN",
}

interface ForecastData {
  today: {
    date: string
    forecast: any
    picksCount: number
  }
  yesterday: {
    date: string
    forecast: any
    stats: {
      totalPicks: number
      moodCorrect: number
      artistCorrect: number
      bothCorrect: number
      moodAccuracy: number
      artistAccuracy: number
      totalMojiAwarded: number
    } | null
  }
  recentDays: Array<{
    forecast_date: string
    status: string
    winning_mood: string | null
    winning_artist: string | null
    total_picks: number | null
  }>
  unresolvedDays: Array<{
    forecast_date: string
    total_picks: number | null
  }>
  premiumSubscribers: number
  totalMojiCirculation: number
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolveDate, setResolveDate] = useState("")
  const [resolveResult, setResolveResult] = useState<any>(null)
  const [resolveError, setResolveError] = useState("")

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/forecast")
      const json = await res.json()
      setData(json)
    } catch {} finally { setLoading(false) }
  }

  const handleResolve = async (date?: string) => {
    const targetDate = date || resolveDate || data?.yesterday.date
    if (!targetDate) return
    setResolving(true)
    setResolveResult(null)
    setResolveError("")
    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", date: targetDate }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setResolveResult(json)
        await fetchData()
      } else {
        setResolveError(json.error || "Resolution failed")
      }
    } catch {
      setResolveError("Network error")
    } finally { setResolving(false) }
  }

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
        <h1 className="text-2xl font-bold text-white">Forecast</h1>
        <p className="text-gray-400">Manage daily forecasts, resolve results, track accuracy</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          iconColor="text-purple-400"
          iconBg="bg-purple-400/10"
          value={data?.today.picksCount || 0}
          label="Today's Picks"
        />
        <StatCard
          icon={Users}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          value={data?.premiumSubscribers || 0}
          label="Premium Subs"
        />
        <StatCard
          icon={Coins}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          value={data?.totalMojiCirculation || 0}
          label="$MOJI in Circulation"
          format
        />
        <StatCard
          icon={AlertTriangle}
          iconColor="text-orange-400"
          iconBg="bg-orange-400/10"
          value={data?.unresolvedDays.length || 0}
          label="Unresolved Days"
        />
      </div>

      {/* Unresolved Days Warning */}
      {data?.unresolvedDays && data.unresolvedDays.length > 0 && (
        <Card className="bg-orange-500/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-orange-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Unresolved Forecast Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.unresolvedDays.map((day) => (
                <div key={day.forecast_date} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-900/50">
                  <div>
                    <span className="text-white font-mono text-sm">{day.forecast_date}</span>
                    <span className="text-gray-500 text-xs ml-3">{day.total_picks || 0} picks</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleResolve(day.forecast_date)}
                    disabled={resolving}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {resolving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Yesterday's Results */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Yesterday&apos;s Results — {data?.yesterday.date}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.yesterday.forecast?.status === "resolved" && data.yesterday.stats ? (
            <div className="space-y-4">
              {/* Winners */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-gray-800/50">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Winning Mood</p>
                  <p className="text-xl font-bold text-white">
                    {MOOD_EMOJIS[data.yesterday.forecast.winning_mood] || "?"}{" "}
                    {MOOD_LABELS[data.yesterday.forecast.winning_mood] || "—"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-gray-800/50">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Winning Artist</p>
                  <p className="text-xl font-bold text-white truncate">
                    {data.yesterday.forecast.winning_artist || "—"}
                  </p>
                </div>
              </div>

              {/* Accuracy Stats */}
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="Total Picks" value={data.yesterday.stats.totalPicks} />
                <MiniStat label="Mood Accuracy" value={`${data.yesterday.stats.moodAccuracy}%`} />
                <MiniStat label="Artist Accuracy" value={`${data.yesterday.stats.artistAccuracy}%`} />
                <MiniStat label="$MOJI Awarded" value={data.yesterday.stats.totalMojiAwarded.toLocaleString()} />
              </div>

              <div className="flex gap-3">
                <MiniStat label="Mood ✅" value={data.yesterday.stats.moodCorrect} />
                <MiniStat label="Artist ✅" value={data.yesterday.stats.artistCorrect} />
                <MiniStat label="Both ✅" value={data.yesterday.stats.bothCorrect} />
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500">
                {data?.yesterday.forecast ? "Not yet resolved" : "No forecast day created"}
              </p>
              {data?.yesterday.forecast && data.yesterday.forecast.status !== "resolved" && (
                <Button
                  onClick={() => handleResolve(data.yesterday.date)}
                  disabled={resolving}
                  className="mt-3 bg-primary text-black hover:bg-primary/90"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Resolve Yesterday
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Resolve */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" /> Manual Resolve
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {resolveError && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> {resolveError}
            </div>
          )}
          {resolveResult && (
            <div className="p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4" />
                Resolved {resolveResult.date}
              </div>
              <p className="text-xs text-green-400/70">
                Mood: {MOOD_EMOJIS[resolveResult.winningMood]} {resolveResult.winningMood} •
                Artist: {resolveResult.winningArtist} •
                Plays: {resolveResult.totalPlays} •
                Scored: {resolveResult.picksScored} picks
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Input
              type="date"
              value={resolveDate}
              onChange={(e) => setResolveDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="max-w-[200px]"
            />
            <Button
              onClick={() => handleResolve()}
              disabled={resolving || !resolveDate}
              className="bg-primary text-black hover:bg-primary/90"
            >
              {resolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Target className="w-4 h-4 mr-2" />}
              Resolve Date
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Enter a date to manually trigger forecast resolution. Uses play_history data to determine winning mood & artist.
          </p>
        </CardContent>
      </Card>

      {/* Recent Forecast History */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Recent Forecast Days</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Date</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-400">Status</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-400">Picks</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Winning Mood</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Winning Artist</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentDays.map((day) => (
                <tr key={day.forecast_date} className="border-b border-gray-800/50">
                  <td className="py-3 px-4 text-white text-sm font-mono">{day.forecast_date}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge
                      variant={day.status === "resolved" ? "default" : "secondary"}
                      className={
                        day.status === "resolved"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }
                    >
                      {day.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-400 text-sm">{day.total_picks || 0}</td>
                  <td className="py-3 px-4 text-sm">
                    {day.winning_mood ? (
                      <span className="text-white">
                        {MOOD_EMOJIS[day.winning_mood]} {MOOD_LABELS[day.winning_mood]}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-white truncate max-w-[200px]">
                    {day.winning_artist || <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
              {(!data?.recentDays || data.recentDays.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
                    No forecast days yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  value,
  label,
  format,
}: {
  icon: any
  iconColor: string
  iconBg: string
  value: number
  label: string
  format?: boolean
}) {
  const display = format
    ? value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString()
    : value.toLocaleString()

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-4">
        <div className={`p-2 rounded-lg ${iconBg} w-fit mb-2`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <p className="text-2xl font-bold text-white">{display}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </CardContent>
    </Card>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg bg-gray-800/50 flex-1">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  )
}
