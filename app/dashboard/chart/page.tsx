"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Loader2, RefreshCw, Zap, Lock, Unlock, RotateCcw, Play, CheckCircle, AlertTriangle } from "lucide-react"

export default function ChartPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/chart")
      setData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const doAction = async (action: string, confirm_msg?: string) => {
    if (confirm_msg && !confirm(confirm_msg)) return
    setActing(action); setMsg("")
    try {
      const res = await fetch("/api/admin/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const result = await res.json()
      setMsg(res.ok ? `✅ ${JSON.stringify(result)}` : `❌ ${result.error || "Failed"}`)
      fetchData()
    } catch (e: any) { setMsg(`❌ ${e.message}`) }
    finally { setActing(null) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>

  const chart = data?.chart || []
  const locked = data?.forecastLocked

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Weekly Chart & Forecast</h2>
          <p className="text-gray-400 text-sm">Week of {data?.weekStart} · {chart.length} tracks ranked</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Forecast Controls */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="w-5 h-5 text-purple-400" /> Forecast Controls</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-gray-800/50 text-center">
              <p className="text-2xl font-bold text-white">{data?.forecastCount || 0}</p>
              <p className="text-xs text-gray-400">Picks this week</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-800/50 text-center">
              <p className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                {locked ? <><Lock className="w-5 h-5 text-red-400" /> Locked</> : <><Unlock className="w-5 h-5 text-green-400" /> Open</>}
              </p>
              <p className="text-xs text-gray-400">Forecast page status</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={locked ? "default" : "destructive"}
              disabled={acting !== null}
              onClick={() => doAction(locked ? "unlock" : "lock")}>
              {acting === "lock" || acting === "unlock" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> :
                locked ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {locked ? "Unlock Forecast" : "Lock Forecast (Coming Soon)"}
            </Button>

            <Button size="sm" variant="outline" disabled={acting !== null}
              onClick={() => doAction("resolve")}>
              {acting === "resolve" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Resolve Last Week
            </Button>

            <Button size="sm" variant="destructive" disabled={acting !== null}
              onClick={() => doAction("reset", "⚠️ This will DELETE all forecast data. Are you sure?")}>
              {acting === "reset" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Reset All Forecasts
            </Button>
          </div>

          {msg && (
            <div className="p-3 rounded-lg bg-gray-800/50 text-sm text-gray-300 break-all">{msg}</div>
          )}
        </CardContent>
      </Card>

      {/* Chart Table */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" /> This Week's Chart</CardTitle></CardHeader>
        <CardContent>
          {chart.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No listens this week yet</p>
          ) : (
            <div className="space-y-2">
              {chart.map((entry: any, i: number) => (
                <div key={entry.track.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/30">
                  <span className="w-8 text-center font-bold text-lg">{i < 3 ? ["🥇","🥈","🥉"][i] : `#${entry.rank}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{entry.track.title}</p>
                    <p className="text-xs text-gray-500">{entry.track.artist}</p>
                  </div>
                  <Badge variant="outline">{entry.listeners} listeners</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolution History */}
      {data?.recentResults?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resolution History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentResults.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30">
                  <div>
                    <p className="text-sm text-white font-medium">Week of {r.week_start}</p>
                    <p className="text-xs text-gray-500">
                      {r.total_participants} participants · {r.perfect_order_count} perfect order · {r.total_onus_awarded?.toLocaleString()} $ONUS awarded
                    </p>
                  </div>
                  {r.jackpot_split && <Badge className="bg-yellow-600">Grand Prize Split</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
