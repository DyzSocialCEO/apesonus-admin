"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Swords, Loader2, Lock, CheckCircle, Ban, Plus, Coins } from "lucide-react"

type Track = { id: number; title: string; artist: string; mood: string }
type MarketType = "head" | "song" | "mood" | "artist"
const MOODS = ["moon", "rekt", "cope", "degen", "zen"]
const PRESETS: Record<string, { ms: number; lockMs: number; label: string }> = {
  "3H":   { ms: 3 * 3600e3,        lockMs: 15 * 60e3, label: "3 hours" },
  "TMRW": { ms: 24 * 3600e3,       lockMs: 3600e3,    label: "tomorrow" },
  "WEEK": { ms: 7 * 24 * 3600e3,   lockMs: 3600e3,    label: "this week" },
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<any[]>([])
  const [positions, setPositions] = useState<Record<string, any>>({})
  const [tracks, setTracks] = useState<Track[]>([])
  const [ledger, setLedger] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  // create form
  const [type, setType] = useState<MarketType>("head")
  const [question, setQuestion] = useState("")
  const [subjectA, setSubjectA] = useState("")
  const [subjectB, setSubjectB] = useState("")
  const [threshold, setThreshold] = useState("0")
  const [preset, setPreset] = useState("WEEK")
  const [pool, setPool] = useState("100000")

  const artists = useMemo(
    () => Array.from(new Set(tracks.map((t) => t.artist))).sort(),
    [tracks]
  )

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/markets", { credentials: "include" })
      const d = await res.json()
      setMarkets(d.markets || [])
      setPositions(d.positions || {})
      setTracks(d.tracks || [])
      setLedger(d.ledger || null)
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { fetchData() }, [])

  const trackName = (id: string) => tracks.find((t) => String(t.id) === String(id))?.title || `#${id}`

  const createMarket = async () => {
    if (!subjectA || !question.trim()) { setMsg("❌ question + subject required"); return }
    setActing("create"); setMsg("")
    const now = Date.now()
    const p = PRESETS[preset]
    const settles_at = new Date(now + p.ms).toISOString()
    const locks_at = new Date(now + p.ms - p.lockMs).toISOString()
    try {
      const res = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create", type, question,
          subject_a: subjectA, subject_b: subjectB || null,
          threshold: Number(threshold) || 0,
          locks_at, settles_at,
          emissions_pool: Number(pool) || 0,
        }),
      })
      const r = await res.json()
      setMsg(res.ok ? "✅ market created" : `❌ ${r.error}`)
      if (res.ok) { setQuestion(""); setSubjectA(""); setSubjectB(""); setThreshold("0"); fetchData() }
    } catch (e: any) { setMsg(`❌ ${e.message}`) }
    finally { setActing(null) }
  }

  const doAction = async (action: string, market_id: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setActing(market_id + action); setMsg("")
    try {
      const res = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, market_id }),
      })
      const r = await res.json()
      setMsg(res.ok ? `✅ ${JSON.stringify(r)}` : `❌ ${r.error}`)
      fetchData()
    } catch (e: any) { setMsg(`❌ ${e.message}`) }
    finally { setActing(null) }
  }

  const statusColor: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-400",
    locked: "bg-amber-500/15 text-amber-400",
    settled: "bg-blue-500/15 text-blue-400",
    void: "bg-zinc-500/15 text-zinc-400",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Swords className="w-6 h-6 text-amber-400" />
        <h1 className="text-2xl font-bold text-white">Markets</h1>
        {ledger && (
          <span className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
            <Coins className="w-4 h-4 text-amber-400" />
            Reserve: {Number(ledger.emissions_reserve).toLocaleString()} · Burned: {Number(ledger.total_burned).toLocaleString()}
          </span>
        )}
      </div>

      {msg && <div className="text-sm font-mono p-3 rounded-lg bg-zinc-800/60 text-zinc-200 break-all">{msg}</div>}

      {/* Create */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create market</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-zinc-400">Type</label>
              <select value={type} onChange={(e) => { setType(e.target.value as MarketType); setSubjectA(""); setSubjectB("") }}
                className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                <option value="head">Head-to-head</option>
                <option value="song">Song</option>
                <option value="mood">Mood</option>
                <option value="artist">Artist</option>
              </select>
            </div>

            {/* Subject A */}
            <div>
              <label className="text-xs text-zinc-400">{type === "mood" ? "Mood" : type === "artist" ? "Artist" : "Track A"}</label>
              <select value={subjectA} onChange={(e) => setSubjectA(e.target.value)}
                className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">— pick —</option>
                {type === "mood"
                  ? MOODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)
                  : type === "artist"
                  ? artists.map((a) => <option key={a} value={a}>{a}</option>)
                  : tracks.map((t) => <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>)}
              </select>
            </div>

            {/* Subject B (head = required, artist = optional) */}
            {(type === "head" || type === "artist") && (
              <div>
                <label className="text-xs text-zinc-400">{type === "head" ? "Track B" : "Artist B (optional)"}</label>
                <select value={subjectB} onChange={(e) => setSubjectB(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">{type === "head" ? "— pick —" : "— none —"}</option>
                  {type === "head"
                    ? tracks.map((t) => <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>)
                    : artists.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-zinc-400">{type === "head" ? "Out-streams by (N)" : type === "mood" ? "Target (0 = dominant)" : "Threshold (N plays)"}</label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="mt-1" />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Timeframe</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}
                className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Emissions pool ($ONUS)</label>
              <Input type="number" value={pool} onChange={(e) => setPool(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400">Question (shown to users)</label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will McBagholder out-stream Lola Likwidity by 1,500 this week?" className="mt-1" />
          </div>

          <Button onClick={createMarket} disabled={acting === "create"}>
            {acting === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create market"}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader><CardTitle>All markets</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
          ) : markets.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4">No markets yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {markets.map((m) => {
                const pos = positions[m.id] || { back: 0, fade: 0, backStake: 0, fadeStake: 0, n: 0 }
                const subjLabel = m.type === "head"
                  ? `${trackName(m.subject_a)} vs ${trackName(m.subject_b)}`
                  : m.type === "song" ? trackName(m.subject_a)
                  : `${String(m.subject_a).toUpperCase()}${m.subject_b ? " vs " + m.subject_b : ""}`
                return (
                  <div key={m.id} className="border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Badge className="uppercase text-[10px]">{m.type}</Badge>
                      <Badge className={`text-[10px] ${statusColor[m.status] || ""}`}>{m.status}</Badge>
                      {m.result && <Badge className="text-[10px] bg-purple-500/15 text-purple-300">→ {m.result}</Badge>}
                      <span className="ml-auto text-xs text-zinc-500">pool {Number(m.emissions_pool).toLocaleString()}</span>
                    </div>
                    <p className="text-white text-sm mt-2 font-medium">{m.question}</p>
                    <p className="text-zinc-500 text-xs mt-1">{subjLabel} · threshold {m.threshold} · settles {new Date(m.settles_at).toLocaleString()}</p>
                    <p className="text-zinc-400 text-xs mt-1">
                      {pos.n} calls — <span className="text-emerald-400">back {pos.back} ({Number(pos.backStake).toLocaleString()})</span> · <span className="text-red-400">fade {pos.fade} ({Number(pos.fadeStake).toLocaleString()})</span>
                    </p>

                    {(m.status === "open" || m.status === "locked") && (
                      <div className="flex gap-2 mt-3">
                        {m.status === "open" && (
                          <Button variant="outline" size="sm" onClick={() => doAction("lock", m.id)} disabled={acting === m.id + "lock"}>
                            {acting === m.id + "lock" ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Lock className="w-3 h-3 mr-1" /> Lock</>}
                          </Button>
                        )}
                        <Button size="sm" onClick={() => doAction("settle", m.id, "Settle now? Reads plays, pays winners, returns all stakes.")} disabled={acting === m.id + "settle"}>
                          {acting === m.id + "settle" ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Settle</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => doAction("void", m.id, "Void? Refunds every stake AND entry fee.")} disabled={acting === m.id + "void"}>
                          {acting === m.id + "void" ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Ban className="w-3 h-3 mr-1" /> Void</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
