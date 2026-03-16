"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TrendingUp, Plus, Loader2, RefreshCw, CheckCircle, XCircle, Clock, Zap, Lock, Hash, Trash2, Pencil } from "lucide-react"

interface Forecast {
  id: number
  question: string
  artist_id: string
  target_value: number
  target_period_start: string
  target_period_end: string
  vote_deadline: string
  status: "open" | "closed" | "resolved"
  result: boolean | null
  actual_value: number | null
  proof_salt: string | null
  yesCount: number
  noCount: number
  totalVotes: number
  created_at: string
}

const ARTISTS = [
  { id: "aunty-rugsy", name: "Aunty Rugsy" },
  { id: "chartnobyl-bro", name: "Chartnobyl Bro" },
  { id: "coinalisa", name: "Coinalisa" },
  { id: "down-bad-dave", name: "Down Bad Dave" },
  { id: "lola-likwidity", name: "Lola Likwidity" },
  { id: "miss-candlesticker", name: "Miss Candlesticker" },
  { id: "satoshi-deluxe", name: "Satoshi Deluxe" },
  { id: "shill-shady", name: "Shill Shady" },
  { id: "shilliam-dafoe", name: "Shilliam Dafoe" },
  { id: "satosheek", name: "Satosheek" },
]

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState("")

  // Create form
  const [artistId, setArtistId] = useState(ARTISTS[0].id)
  const [targetValue, setTargetValue] = useState("100")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [voteDeadline, setVoteDeadline] = useState("")

  const artistName = (id: string) => ARTISTS.find(a => a.id === id)?.name || id

  useEffect(() => {
    // Set default dates
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - now.getDay() + 1)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    const nextMonday = new Date(monday)
    nextMonday.setDate(monday.getDate() + 7)

    setPeriodStart(monday.toISOString().split("T")[0])
    setPeriodEnd(friday.toISOString().split("T")[0])
    setVoteDeadline(friday.toISOString().split("T")[0] + "T23:59:00Z")
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/forecast")
      const data = await res.json()
      setForecasts(data.forecasts || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async () => {
    setCreating(true)
    setMsg("")
    const question = `Will ${artistName(artistId)} hit ${parseInt(targetValue).toLocaleString()} unique listens by ${new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}?`

    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          question,
          artistId,
          targetValue,
          periodStart,
          periodEnd,
          voteDeadline,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg("Forecast created!")
        setShowCreate(false)
        fetchData()
      } else {
        setMsg(data.error || "Failed")
      }
    } catch { setMsg("Failed") } finally { setCreating(false) }
  }

  const handleAction = async (forecastId: number, action: "close" | "resolve") => {
    setMsg("")
    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, forecastId }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(action === "resolve"
          ? `Resolved: ${data.result} (${data.actualValue} listens, ${data.totalAwarded} $ONUS awarded)`
          : "Forecast closed")
        fetchData()
      } else {
        setMsg(data.error || "Failed")
      }
    } catch { setMsg("Failed") }
  }

  const handleDelete = async (forecastId: number) => {
    if (!confirm("Delete this forecast and all votes? This cannot be undone.")) return
    setMsg("")
    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", forecastId }),
      })
      const data = await res.json()
      if (data.success) { setMsg("Forecast deleted"); fetchData() }
      else setMsg(data.error || "Delete failed")
    } catch { setMsg("Failed") }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fan Forecast</h1>
          <p className="text-sm text-gray-400">Create weekly predictions for users to vote on</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-primary text-black">
            <Plus className="w-4 h-4 mr-1" /> New Forecast
          </Button>
        </div>
      </div>

      {msg && (
        <div className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">{msg}</div>
      )}

      {/* Create Form */}
      {showCreate && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-sm text-white">Create New Forecast</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Artist</label>
              <select
                value={artistId}
                onChange={e => setArtistId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {ARTISTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Target Unique Listens</label>
              <Input
                type="number"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Period Start</label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Period End</label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Vote Deadline</label>
              <Input type="datetime-local" value={voteDeadline.replace("Z", "")} onChange={e => setVoteDeadline(e.target.value + "Z")} className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Preview question:</p>
              <p className="text-sm text-white font-medium">
                Will {artistName(artistId)} hit {parseInt(targetValue || "0").toLocaleString()} unique listens by {periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "..."}?
              </p>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary text-black">
              {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Forecast
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Forecast List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : forecasts.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center text-gray-500">No forecasts yet. Create your first one.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forecasts.map(f => (
            <Card key={f.id} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white mb-1">{f.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={f.status === "open" ? "default" : f.status === "resolved" ? "secondary" : "outline"}
                        className={`text-[10px] ${f.status === "open" ? "bg-green-500/20 text-green-400 border-green-500/30" : f.status === "resolved" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "text-yellow-400 border-yellow-400/30"}`}>
                        {f.status.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] text-gray-500">
                        {f.target_period_start} → {f.target_period_end}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        Target: {f.target_value.toLocaleString()}
                      </span>
                    </div>

                    {/* Vote counts */}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-green-400">YES: {f.yesCount}</span>
                      <span className="text-xs text-red-400">NO: {f.noCount}</span>
                      <span className="text-[10px] text-gray-500">{f.totalVotes} total</span>
                    </div>

                    {/* Result */}
                    {f.status === "resolved" && (
                      <div className="mt-2 flex items-center gap-2">
                        {f.result ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm font-bold text-white">
                          {f.result ? "YES" : "NO"} — {f.actual_value?.toLocaleString()} actual listens
                        </span>
                        {f.proof_salt && (
                          <span className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Hash className="w-3 h-3" /> Proof published
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {f.status === "open" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleAction(f.id, "close")}>
                          <Lock className="w-3.5 h-3.5 mr-1" /> Close
                        </Button>
                        <Button size="sm" onClick={() => handleAction(f.id, "resolve")} className="bg-primary text-black">
                          <Zap className="w-3.5 h-3.5 mr-1" /> Resolve
                        </Button>
                      </>
                    )}
                    {f.status === "closed" && (
                      <Button size="sm" onClick={() => handleAction(f.id, "resolve")} className="bg-primary text-black">
                        <Zap className="w-3.5 h-3.5 mr-1" /> Resolve
                      </Button>
                    )}
                    {f.status !== "resolved" && (
                      <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-900/20"
                        onClick={() => handleDelete(f.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
