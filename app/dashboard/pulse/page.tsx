"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react"

/**
 * /dashboard/pulse — Culture Pulse
 *
 * Live admin view of Vibe Check Tier 1 community sentiment. Reads from
 * /api/admin/pulse which queries market_sentiment_votes (the same table
 * the PWA writes to). Three buckets: bullish / bearish / neutral.
 *
 * Previously rendered a five-mood breakdown (moon/rekt/cope/degen/zen)
 * pointed at the killed daily_mood_votes table — that was the legacy
 * mood check-in system. Tier 1 replaced it pre-launch.
 */

type Sentiment = "bullish" | "bearish" | "neutral"

interface SentimentMeta {
  Icon: typeof TrendingUp
  color: string
  label: string
}

const SENTIMENT_CONFIG: Record<Sentiment, SentimentMeta> = {
  bullish: { Icon: TrendingUp,   color: "#22c55e", label: "BULLISH" },
  bearish: { Icon: TrendingDown, color: "#ef4444", label: "BEARISH" },
  neutral: { Icon: Minus,        color: "#06b6d4", label: "NEUTRAL" },
}

const SENTIMENT_ORDER: Sentiment[] = ["bullish", "bearish", "neutral"]

interface PulsePayload {
  today: { total: number; breakdown: Record<Sentiment, number> }
  weekTrend: Record<string, Record<Sentiment, number>>
  totalVoters: number
}

export default function PulsePage() {
  const [data, setData] = useState<PulsePayload | null>(null)
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
  const breakdown: Record<Sentiment, number> =
    data?.today?.breakdown || { bullish: 0, bearish: 0, neutral: 0 }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Culture Pulse</h1>
        <p className="text-gray-400">
          Daily market sentiment from the Vibe Check Tier 1 vote
        </p>
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
            <p className="text-xs text-gray-500 mb-2">Total All-Time Votes</p>
            <p className="text-2xl font-bold text-white">
              {data?.totalVoters || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">
            Today&apos;s Sentiment Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {SENTIMENT_ORDER.map((sentiment) => {
              const config = SENTIMENT_CONFIG[sentiment]
              const count = breakdown[sentiment] || 0
              const pct = todayTotal > 0 ? Math.round((count / todayTotal) * 100) : 0
              const { Icon } = config
              return (
                <div key={sentiment}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: config.color }} />
                      <span className="text-sm font-medium text-white">
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{count} votes</span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: config.color }}
                      >
                        {pct}%
                      </span>
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
          <CardTitle className="text-lg text-white">7-Day Sentiment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.weekTrend && Object.keys(data.weekTrend).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-xs text-gray-500">
                      Date
                    </th>
                    {SENTIMENT_ORDER.map((sentiment) => {
                      const config = SENTIMENT_CONFIG[sentiment]
                      const { Icon } = config
                      return (
                        <th
                          key={sentiment}
                          className="text-center py-2 px-3 text-xs"
                          title={config.label}
                        >
                          <div className="flex justify-center">
                            <Icon className="w-4 h-4" style={{ color: config.color }} />
                          </div>
                        </th>
                      )
                    })}
                    <th className="text-right py-2 px-3 text-xs text-gray-500">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.weekTrend)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, sentiments]) => {
                      const dayTotal = SENTIMENT_ORDER.reduce(
                        (sum, s) => sum + (sentiments[s] || 0),
                        0,
                      )
                      return (
                        <tr key={date} className="border-b border-gray-800/50">
                          <td className="py-2 px-3 text-sm text-gray-400">
                            {new Date(date + "T00:00:00").toLocaleDateString(
                              "en-US",
                              { weekday: "short", month: "short", day: "numeric" },
                            )}
                          </td>
                          {SENTIMENT_ORDER.map((s) => (
                            <td
                              key={s}
                              className="py-2 px-3 text-center text-sm text-white"
                            >
                              {sentiments[s] || 0}
                            </td>
                          ))}
                          <td className="py-2 px-3 text-right text-sm font-bold text-white">
                            {dayTotal}
                          </td>
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
