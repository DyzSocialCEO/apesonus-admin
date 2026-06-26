"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Swords, Loader2, Search, RefreshCw, Trophy, AlertTriangle, Save, Flag } from "lucide-react"

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return Math.round(n).toLocaleString()
}
const usd = (n: number) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const COLOR: Record<string, string> = {
  "chartnobyl-bro": "#c6ff2e", "lola-likwidity": "#ff2e7e", "mcbagholder": "#ffc847",
  "coinalisa": "#5ac8fa", "dj-dustwallet": "#a855f7", "shilliam-dafoe": "#ff8a3d", "satosheek": "#7af5c0",
}

export default function PitAdminPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [purseEdits, setPurseEdits] = useState<Record<number, { purse: string; sponsor: string }>>({})
  const [dialEdits, setDialEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = async (user?: string) => {
    if (user) setSearching(true); else setLoading(true)
    try {
      const res = await fetch("/api/admin/pit" + (user ? `?user=${encodeURIComponent(user)}` : ""))
      setData(await res.json())
    } catch {} finally { setLoading(false); setSearching(false) }
  }
  useEffect(() => { load() }, [])

  const post = async (payload: any, tag: string) => {
    setBusy(tag)
    try {
      const res = await fetch("/api/admin/pit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const j = await res.json()
      setFlash(j.error ? `Error: ${j.error}` : (j.clamped ? `Saved, clamped to safe range (${j.value})` : "Saved"))
      await load()
    } catch { setFlash("Request failed") } finally { setBusy(null); setTimeout(() => setFlash(null), 4000) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  const factions = data?.factions ?? []
  const maxNp = Math.max(1, ...factions.map((f: any) => f.total_np))
  const epochs = data?.epochs ?? []
  const dials = data?.dials ?? []
  const current = data?.current_epoch ?? 0
  const user = data?.user

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Swords className="w-5 h-5 text-primary" /></div>
          <div><h1 className="text-2xl font-bold text-white">THE PIT</h1><p className="text-sm text-gray-500">Prize desk and Node Power inspector · epoch {current}</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
      </div>

      {flash && <div className="text-sm px-4 py-2 rounded-lg bg-primary/10 text-primary">{flash}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-gray-500 text-sm mb-1">NP in play</div><div className="text-2xl font-bold text-white">{fmt(data?.totals?.total_np ?? 0)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-gray-500 text-sm mb-1">Qualified plays</div><div className="text-2xl font-bold text-white">{fmt(data?.totals?.qualified_plays ?? 0)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-gray-500 text-sm mb-1">Current epoch</div><div className="text-2xl font-bold text-white">{current}</div></CardContent></Card>
      </div>

      {/* Weekly purse desk */}
      <Card>
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Weekly purse</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">The purse is money we put up or a sponsor funds, announced before the week. It is never a slice of player fees. Leave it at zero and the week pays nothing.</p>
          {epochs.map((e: any) => {
            const edit = purseEdits[e.epoch_number] ?? { purse: String(e.purse_usd ?? 0), sponsor: e.sponsor_name ?? "" }
            const isCurrent = e.epoch_number === current
            return (
              <div key={e.epoch_number} className={`flex flex-wrap items-center gap-2 p-3 rounded-lg ${isCurrent ? "bg-primary/5 border border-primary/20" : "bg-gray-800/40"}`}>
                <span className="font-mono text-sm w-16 text-gray-300">wk {e.epoch_number}</span>
                <Badge className={`border-0 ${e.status === "paid" ? "bg-lime-500/15 text-lime-400" : e.status === "rolled" ? "bg-amber-500/15 text-amber-400" : "bg-gray-600/30 text-gray-300"}`}>{e.status}</Badge>
                <div className="flex items-center gap-1"><span className="text-gray-500 text-sm">$</span>
                  <Input type="number" value={edit.purse} onChange={(ev) => setPurseEdits({ ...purseEdits, [e.epoch_number]: { ...edit, purse: ev.target.value } })} style={{ width: 100 }} />
                </div>
                <Input placeholder="sponsor (optional)" value={edit.sponsor} onChange={(ev) => setPurseEdits({ ...purseEdits, [e.epoch_number]: { ...edit, sponsor: ev.target.value } })} style={{ width: 180 }} />
                {Number(e.rollover_in) > 0 && <span className="text-xs text-amber-400">+{usd(e.rollover_in)} rolled in</span>}
                {e.status === "paid" && <span className="text-xs text-gray-500">paid {usd(e.paid_total)} · winner {e.winner_artist_id || "—"}</span>}
                <Button size="sm" variant="outline" disabled={busy === `purse${e.epoch_number}`} onClick={() => post({ action: "set_purse", epoch: e.epoch_number, purse_usd: Number(edit.purse), sponsor_name: edit.sponsor }, `purse${e.epoch_number}`)}>
                  {busy === `purse${e.epoch_number}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </Button>
              </div>
            )
          })}
          <div className="pt-2 border-t border-gray-800 flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={busy === "close"} onClick={() => { if (confirm(`Close epoch ${current} now? This pays out, wipes the board, and starts a fresh week.`)) post({ action: "close_epoch", epoch: current }, "close") }}>
              {busy === "close" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Flag className="w-4 h-4 mr-2" />} Close epoch {current} now
            </Button>
            <span className="text-xs text-gray-500">The Sunday cron does this automatically. Manual close is for testing.</span>
          </div>
        </CardContent>
      </Card>

      {/* Dials with danger guidance */}
      <Card>
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Dials</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {dials.map((d: any) => {
            const edit = dialEdits[d.key] ?? String(d.value ?? "")
            return (
              <div key={d.key} className="p-3 rounded-lg bg-gray-800/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-gray-200 w-56">{d.key}</span>
                  <Input type="number" value={edit} onChange={(ev) => setDialEdits({ ...dialEdits, [d.key]: ev.target.value })} style={{ width: 110 }} />
                  <span className="text-xs text-gray-500">safe {d.min} to {d.max}</span>
                  <Button size="sm" variant="outline" disabled={busy === `dial${d.key}`} onClick={() => post({ action: "set_dial", key: d.key, value: Number(edit) }, `dial${d.key}`)}>
                    {busy === `dial${d.key}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{d.note}</p>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Community engagement — top players by engagement weight */}
      <Card>
        <CardHeader><CardTitle className="text-white">Community engagement</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          <p className="text-xs text-gray-500 mb-1">Players ranked by total engagement — Node Power across all artists × loyalty — the same weight the pool pays by. Not per-artist.</p>
          {((data?.engagement_top ?? []).length === 0) ? (
            <p className="text-sm text-gray-600">No engagement yet.</p>
          ) : (data.engagement_top.map((p: any) => (
            <div key={p.user_id}>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-600 font-mono w-6">{String(p.rank).padStart(2, "0")}</span>
                <span className="text-white font-medium flex-1 truncate">{p.name}</span>
                <span className="font-mono text-lime-400">{(p.share * 100 > 0 && p.share * 100 < 0.1) ? "<0.1" : (p.share * 100).toFixed(1)}%</span>
                <span className="font-mono text-gray-500 text-xs w-20 text-right">{fmt(p.weight)} wt</span>
              </div>
              <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full rounded-full bg-lime-400" style={{ width: `${Math.max(2, p.share * 100)}%` }} /></div>
            </div>
          )))}
        </CardContent>
      </Card>

      {/* Artist activity (informational — not the payout metric) */}
      <Card>
        <CardHeader><CardTitle className="text-white">Artist activity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500 -mt-1">How the roster is doing this week. Engagement rewards don't depend on which artist — this is just the music board.</p>
          {factions.map((f: any, i: number) => {
            const c = COLOR[f.artist_id] || "#c6ff2e"
            return (
              <div key={f.artist_id}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-white font-medium flex-1">{f.name}</span>
                  <span className="font-mono" style={{ color: c }}>{fmt(f.total_np)} NP</span>
                </div>
                <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(f.total_np / maxNp) * 100}%`, background: c }} /></div>
                <div className="mt-1 ml-9 text-xs text-gray-500 font-mono">{f.players} scouts · {fmt(f.lifetime_streams)} streams this week{f.lifetime_streams < 100 && <span style={{ color: c }}> · undervalued</span>}</div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Inspect a player */}
      <Card>
        <CardHeader><CardTitle className="text-white">Inspect a player</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="User ID, display name, or email" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && query.trim() && load(query.trim())} />
            <Button onClick={() => query.trim() && load(query.trim())} disabled={searching}>{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
          </div>
          {user && !user.found && <p className="text-sm text-gray-500">No player matched “{user.query}”.</p>}
          {user && user.found && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Ammo</span><span className="font-mono text-amber-400">{fmt(user.ammo)}</span>
                <span className="text-gray-500">Embers</span><span className="font-mono text-lime-400">{fmt(user.embers)}</span>
                <span className="text-gray-700 font-mono text-xs truncate">{user.user_id}</span>
              </div>
              {user.engagement && user.engagement.rank > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">Engagement</span>
                  <span className="font-mono text-lime-400">#{user.engagement.rank}</span>
                  <span className="text-gray-600 text-xs">of {user.engagement.active} active</span>
                  <span className="font-mono text-emerald-400">{(user.engagement.share * 100).toFixed(1)}% share</span>
                </div>
              )}
              {user.nodes.length === 0 ? <p className="text-sm text-gray-500">This player holds no nodes.</p> : (
                <div className="space-y-2">
                  {user.nodes.map((n: any) => (
                    <div key={n.artist_id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLOR[n.artist_id] || "#c6ff2e" }} />
                      <span className="text-white text-sm flex-1">{n.name}</span>
                      <span className="font-mono text-sm" style={{ color: COLOR[n.artist_id] || "#c6ff2e" }}>{fmt(n.np)} NP</span>
                      {n.state === "grace" && <Badge className="bg-lime-500/15 text-lime-400 border-0">Safe · {Math.ceil(n.detail)}h</Badge>}
                      {n.state === "bleeding" && <Badge className="bg-amber-500/15 text-amber-400 border-0">Bleeding · {Math.round(n.detail * 100)}%</Badge>}
                      {n.state === "dead" && <Badge className="bg-gray-500/15 text-gray-400 border-0">Dead</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
