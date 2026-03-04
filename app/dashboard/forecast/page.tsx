"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Users, Lock, Play, Pause, CheckCircle, Plus, AlertCircle } from "lucide-react"

interface Round {
  id: number
  week_start: string
  status: string
  participant_count: number
  winner_artist: string | null
  listener_counts: Record<string, number> | null
  locked_at: string | null
  settled_at: string | null
  created_at: string
  entryCount: number
  entries: Array<{
    telegram_id: string
    pick_1: string
    pick_2: string
    pick_3: string
    score: number | null
    onus_earned: number | null
  }>
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  open: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Play, label: "OPEN" },
  locked: { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Lock, label: "LOCKED" },
  settled: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle, label: "SETTLED" },
  resolved: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle, label: "RESOLVED" },
  paused: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Pause, label: "PAUSED" },
}

export default function ForecastPage() {
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  const fetchRounds = async () => {
    try {
      const res = await fetch("/api/admin/forecast")
      if (res.ok) {
        const data = await res.json()
        setRounds(data.rounds || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRounds() }, [])

  const doAction = async (action: string, weekStart?: string) => {
    setActionLoading(action + (weekStart || ""))
    setMessage(null)
    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, weekStart }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ text: `${action.toUpperCase()}: ${data.message || "Success"}`, type: "success" })
        fetchRounds()
      } else {
        setMessage({ text: data.error || "Failed", type: "error" })
      }
    } catch {
      setMessage({ text: "Network error", type: "error" })
    } finally {
      setActionLoading(null)
    }
  }

  const getCurrentWeekStart = () => {
    const now = new Date()
    const day = now.getUTCDay()
    const offset = day === 0 ? 6 : day - 1
    const mon = new Date(now)
    mon.setUTCDate(now.getUTCDate() - offset)
    return mon.toISOString().split("T")[0]
  }

  const currentWeek = getCurrentWeekStart()
  const hasCurrentRound = rounds.some(r => r.week_start === currentWeek)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fan Forecast</h1>
          <p className="text-gray-400 text-sm mt-1">Manage weekly prediction rounds</p>
        </div>
        {!hasCurrentRound && (
          <button
            onClick={() => doAction("open")}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Open This Week
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading rounds...</div>
      ) : rounds.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No forecast rounds yet</p>
            <p className="text-gray-600 text-sm mt-1">Click "Open This Week" to create the first round</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rounds.map((round) => {
            const config = STATUS_CONFIG[round.status] || STATUS_CONFIG.open
            const StatusIcon = config.icon
            const isCurrentWeek = round.week_start === currentWeek

            return (
              <Card key={round.id} className={`bg-gray-900 border-gray-800 ${isCurrentWeek ? "ring-1 ring-primary/30" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg text-white">
                        Week of {round.week_start}
                      </CardTitle>
                      {isCurrentWeek && (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">CURRENT</Badge>
                      )}
                      <Badge className={`${config.color} border text-[10px]`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {round.status === "open" && (
                        <>
                          <button
                            onClick={() => doAction("lock", round.week_start)}
                            disabled={actionLoading !== null}
                            className="px-3 py-1.5 rounded-md bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <Lock className="w-3 h-3 inline mr-1" />Lock
                          </button>
                          <button
                            onClick={() => doAction("pause", round.week_start)}
                            disabled={actionLoading !== null}
                            className="px-3 py-1.5 rounded-md bg-gray-600/20 hover:bg-gray-600/30 text-gray-400 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <Pause className="w-3 h-3 inline mr-1" />Pause
                          </button>
                        </>
                      )}
                      {(round.status === "locked" || round.status === "open") && (
                        <button
                          onClick={() => doAction("settle", round.week_start)}
                          disabled={actionLoading !== null}
                          className="px-3 py-1.5 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Trophy className="w-3 h-3 inline mr-1" />Settle
                        </button>
                      )}
                      {round.status === "paused" && (
                        <button
                          onClick={() => doAction("open", round.week_start)}
                          disabled={actionLoading !== null}
                          className="px-3 py-1.5 rounded-md bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Play className="w-3 h-3 inline mr-1" />Resume
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-400">Entries</span>
                      </div>
                      <p className="text-xl font-bold text-white">{round.entryCount}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs text-gray-400">Winner</span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">
                        {round.winner_artist || "—"}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-gray-400">Status</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {round.settled_at ? new Date(round.settled_at).toLocaleDateString() : round.locked_at ? "Locked " + new Date(round.locked_at).toLocaleDateString() : "In progress"}
                      </p>
                    </div>
                  </div>

                  {/* Listener counts if settled */}
                  {round.listener_counts && Object.keys(round.listener_counts).length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-2">Artist Rankings (unique listeners)</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(round.listener_counts)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .slice(0, 5)
                          .map(([artist, count], i) => (
                            <Badge key={artist} className={`${i === 0 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-gray-800 text-gray-300 border-gray-700"} border text-xs`}>
                              #{i + 1} {artist}: {count as number}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Entries table */}
                  {round.entries.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="text-left py-2 px-3 text-xs text-gray-400">User</th>
                            <th className="text-left py-2 px-3 text-xs text-gray-400">Pick 1</th>
                            <th className="text-left py-2 px-3 text-xs text-gray-400">Pick 2</th>
                            <th className="text-left py-2 px-3 text-xs text-gray-400">Pick 3</th>
                            <th className="text-center py-2 px-3 text-xs text-gray-400">Score</th>
                            <th className="text-right py-2 px-3 text-xs text-gray-400">$ONUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {round.entries.map((entry, i) => (
                            <tr key={i} className="border-b border-gray-800/50">
                              <td className="py-2 px-3 text-gray-300 font-mono text-xs">{String(entry.telegram_id).slice(-6)}</td>
                              <td className="py-2 px-3 text-gray-300 text-xs">{entry.pick_1}</td>
                              <td className="py-2 px-3 text-gray-300 text-xs">{entry.pick_2}</td>
                              <td className="py-2 px-3 text-gray-300 text-xs">{entry.pick_3}</td>
                              <td className="py-2 px-3 text-center">
                                {entry.score !== null ? (
                                  <Badge className={`text-[10px] ${entry.score >= 2 ? "bg-green-500/20 text-green-400" : entry.score === 1 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                                    {entry.score}/3
                                  </Badge>
                                ) : "—"}
                              </td>
                              <td className="py-2 px-3 text-right text-primary font-bold text-xs">
                                {entry.onus_earned || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
