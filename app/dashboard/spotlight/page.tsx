"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, Users, Zap, Loader2, RefreshCw, CheckCircle, Clock, Settings } from "lucide-react"

interface SpotlightEntry {
  id: number
  telegram_id: string
  artist_id: string
  artistName: string
  userName: string
  period_start: string
  period_end: string
  onus_earned: number
  onus_cap: number
  settled: boolean
  card_tier: string
  created_at: string
}

interface Summary {
  totalActive: number
  totalSettled: number
  totalOnusAwarded: number
  artistBreakdown: Array<{ artistId: string; name: string; count: number }>
}

export default function SpotlightPage() {
  const [spotlights, setSpotlights] = useState<SpotlightEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [settling, setSettling] = useState(false)
  const [msg, setMsg] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/spotlight?filter=${filter}`)
      const data = await res.json()
      setSpotlights(data.spotlights || [])
      setSummary(data.summary || null)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [filter])

  const handleSettleAll = async () => {
    setSettling(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle" }),
      })
      const result = await res.json()
      setMsg(`Settled ${result.settled || 0} spotlights`)
      fetchData()
    } catch {
      setMsg("Settlement failed")
    } finally { setSettling(false) }
  }

  const handleForceSettle = async (id: number) => {
    try {
      const res = await fetch("/api/admin/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceSettle", spotlightId: id }),
      })
      const result = await res.json()
      setMsg(`Settled: ${result.earned || 0} $ONUS (${result.uniqueListens || 0} listens)`)
      fetchData()
    } catch { setMsg("Failed") }
  }

  const handleUpdateCap = async (id: number) => {
    const newCap = prompt("New monthly ONUS cap:", "50000")
    if (!newCap) return
    try {
      await fetch("/api/admin/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateCap", spotlightId: id, newCap: parseInt(newCap) }),
      })
      setMsg(`Cap updated to ${newCap}`)
      fetchData()
    } catch { setMsg("Failed") }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Spotlight</h1>
          <p className="text-sm text-gray-400">User artist picks and $ONUS tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleSettleAll} disabled={settling} className="bg-primary text-black">
            {settling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Settle Expired
          </Button>
        </div>
      </div>

      {msg && (
        <div className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">
          {msg}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Clock className="w-4 h-4" /> Active Picks
              </div>
              <p className="text-2xl font-bold text-white">{summary.totalActive}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <CheckCircle className="w-4 h-4" /> Settled
              </div>
              <p className="text-2xl font-bold text-white">{summary.totalSettled}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Zap className="w-4 h-4" /> $ONUS Awarded
              </div>
              <p className="text-2xl font-bold text-primary">{summary.totalOnusAwarded.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Star className="w-4 h-4" /> Top Pick
              </div>
              <p className="text-lg font-bold text-white">
                {summary.artistBreakdown[0]?.name || "—"}
              </p>
              {summary.artistBreakdown[0] && (
                <p className="text-xs text-gray-500">{summary.artistBreakdown[0].count} picks</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Artist Breakdown */}
      {summary && summary.artistBreakdown.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Active Picks by Artist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.artistBreakdown.map(a => (
                <div key={a.artistId} className="flex items-center justify-between">
                  <span className="text-sm text-white">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (a.count / Math.max(1, summary.totalActive)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{a.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {["all", "active", "settled"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? "bg-primary text-black" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Spotlight List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : spotlights.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center text-gray-500">
            No spotlight picks yet
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {spotlights.map(s => (
            <Card key={s.id} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{s.userName}</span>
                        <span className="text-xs text-gray-500">→</span>
                        <span className="text-sm font-bold text-primary">{s.artistName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {new Date(s.period_start).toLocaleDateString()} — {new Date(s.period_end).toLocaleDateString()}
                        </span>
                        <Badge variant={s.card_tier === "genesis" ? "default" : "secondary"} className="text-[10px]">
                          {s.card_tier.toUpperCase()}
                        </Badge>
                        {s.settled ? (
                          <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">
                            SETTLED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/30">
                            ACTIVE
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.settled ? (
                      <span className="text-sm font-bold text-primary">+{s.onus_earned.toLocaleString()}</span>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleUpdateCap(s.id)} title="Adjust cap">
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleForceSettle(s.id)}>
                          Settle
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {!s.settled && (
                  <div className="mt-2 text-[10px] text-gray-500">
                    Cap: {s.onus_cap.toLocaleString()} $ONUS/month
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
