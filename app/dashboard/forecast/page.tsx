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
  choices: string[] | null
  choice_ranges: { min: number; max: number }[] | null
  winning_choice: string | null
  yesCount: number
  noCount: number
  choiceCounts: Record<string, number>
  totalVotes: number
  created_at: string
}

const ARTISTS = [
  { id: "chartnobyl-bro", name: "Chartnobyl Bro" },
  { id: "coinalisa", name: "Coinalisa" },
  { id: "dj-dustwallet", name: "DJ Dustwallet" },
  { id: "lola-likwidity", name: "Lola Likwidity" },
  { id: "mcbagholder", name: "McBagholder" },
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
  const [useMultiChoice, setUseMultiChoice] = useState(true)
  const [choices, setChoices] = useState([
    { label: "Under 500", min: 0, max: 499 },
    { label: "500 – 1,000", min: 500, max: 999 },
    { label: "1,000 – 2,500", min: 1000, max: 2499 },
    { label: "2,500+", min: 2500, max: 999999 },
  ])

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

    let question: string
    const payload: any = {
      action: "create",
      artistId,
      targetValue,
      periodStart,
      periodEnd,
      voteDeadline,
    }

    if (useMultiChoice) {
      question = `How many unique listens will ${artistName(artistId)} get by ${periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "..."}?`
      payload.choices = choices.map(c => c.label)
      payload.choiceRanges = choices.map(c => ({ min: c.min, max: c.max }))
    } else {
      question = `Will ${artistName(artistId)} hit ${parseInt(targetValue).toLocaleString()} unique listens by ${new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}?`
    }
    payload.question = question

    try {
      const res = await fetch("/api/admin/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <button onClick={() => setUseMultiChoice(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!useMultiChoice ? "bg-primary/20 text-primary border border-primary/40" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>
                Yes / No
              </button>
              <button onClick={() => setUseMultiChoice(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${useMultiChoice ? "bg-primary/20 text-primary border border-primary/40" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>
                Multiple Choice
              </button>
            </div>

            {!useMultiChoice && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Target Unique Listens</label>
                <Input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
              </div>
            )}

            {useMultiChoice && (
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Choice Ranges (users pick one)</label>
                <div className="space-y-2">
                  {choices.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={c.label} onChange={e => { const n = [...choices]; n[i].label = e.target.value; setChoices(n) }}
                        className="bg-gray-800 border-gray-700 text-white flex-1" placeholder="Label" />
                      <Input type="number" value={c.min} onChange={e => { const n = [...choices]; n[i].min = parseInt(e.target.value) || 0; setChoices(n) }}
                        className="bg-gray-800 border-gray-700 text-white w-20" placeholder="Min" />
                      <span className="text-gray-500 text-xs">to</span>
                      <Input type="number" value={c.max} onChange={e => { const n = [...choices]; n[i].max = parseInt(e.target.value) || 0; setChoices(n) }}
                        className="bg-gray-800 border-gray-700 text-white w-20" placeholder="Max" />
                      {choices.length > 2 && (
                        <button onClick={() => setChoices(choices.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                      )}
                    </div>
                  ))}
                  {choices.length < 6 && (
                    <button onClick={() => setChoices([...choices, { label: "", min: 0, max: 0 }])}
                      className="text-xs text-primary hover:underline">+ Add choice</button>
                  )}
                </div>
              </div>
            )}

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
                {useMultiChoice
                  ? `How many unique listens will ${artistName(artistId)} get by ${periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "..."}?`
                  : `Will ${artistName(artistId)} hit ${parseInt(targetValue || "0").toLocaleString()} unique listens by ${periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "..."}?`}
              </p>
              {useMultiChoice && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {choices.filter(c => c.label).map((c, i) => (
                    <span key={i} className="px-2 py-1 rounded text-xs bg-primary/10 text-primary border border-primary/20">{c.label}</span>
                  ))}
                </div>
              )}
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
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {f.choices && f.choices.length > 0 ? (
                        <>
                          {f.choices.map(c => (
                            <span key={c} className="text-xs text-primary">{c}: {f.choiceCounts?.[c] || 0}</span>
                          ))}
                          <span className="text-[10px] text-gray-500">{f.totalVotes} total</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-green-400">YES: {f.yesCount}</span>
                          <span className="text-xs text-red-400">NO: {f.noCount}</span>
                          <span className="text-[10px] text-gray-500">{f.totalVotes} total</span>
                        </>
                      )}
                    </div>

                    {/* Result */}
                    {f.status === "resolved" && (
                      <div className="mt-2 flex items-center gap-2">
                        {f.winning_choice ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-primary" />
                            <span className="text-sm font-bold text-white">
                              {f.winning_choice} — {f.actual_value?.toLocaleString()} actual listens
                            </span>
                          </>
                        ) : (
                          <>
                            {f.result ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                            <span className="text-sm font-bold text-white">
                              {f.result ? "YES" : "NO"} — {f.actual_value?.toLocaleString()} actual listens
                            </span>
                          </>
                        )}
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
