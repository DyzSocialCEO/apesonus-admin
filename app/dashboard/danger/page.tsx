"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Loader2, Plus, Gavel, Ban, Search, Flame } from "lucide-react"

type Track = { id: number; title: string; artist: string; mood: string }
type DEvent = {
  id: string; track_id: number; track_title: string; track_artist: string
  title: string; threshold: number; raised: number
  starts_at: string; ends_at: string; status: string; resolved_at: string | null
}

const UNITS: Record<string, number> = { minutes: 60, hours: 3600, days: 86400 }
const STATUS_STYLE: Record<string, string> = {
  live: "bg-pink-500/15 text-pink-400",
  saved: "bg-emerald-500/15 text-emerald-400",
  purged: "bg-zinc-600/30 text-zinc-300",
  void: "bg-red-500/15 text-red-400",
}

export default function DangerPage() {
  const [events, setEvents] = useState<DEvent[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  const [selTrack, setSelTrack] = useState<number | null>(null)
  const [title, setTitle] = useState("")
  const [durVal, setDurVal] = useState("")
  const [durUnit, setDurUnit] = useState("hours")
  const [threshold, setThreshold] = useState("")
  const [search, setSearch] = useState("")

  async function load() {
    try {
      const res = await fetch("/api/admin/danger", { credentials: "include" })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      setEvents(data.events || [])
      setTracks(data.tracks || [])
    } catch (e: any) { setMsg(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
  }, [tracks, search])

  const selectedTrack = tracks.find((t) => t.id === selTrack)

  async function launch() {
    const duration_seconds = (Number(durVal) || 0) * (UNITS[durUnit] || 3600)
    if (!selTrack) { setMsg("pick a track to threaten"); return }
    if (!title.trim()) { setMsg("write a rally message"); return }
    if (duration_seconds <= 0) { setMsg("set a countdown"); return }
    if ((Number(threshold) || 0) <= 0) { setMsg("set a rescue threshold"); return }
    setActing("create"); setMsg("")
    try {
      const res = await fetch("/api/admin/danger", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ action: "create", track_id: selTrack, title: title.trim(), duration_seconds, threshold: Number(threshold) }),
      })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      setSelTrack(null); setTitle(""); setDurVal(""); setThreshold("")
      setMsg("event launched — live now")
      load()
    } catch (e: any) { setMsg(e.message) } finally { setActing(null) }
  }

  async function act(event_id: string, action: string) {
    if (action === "resolve" && !confirm("Resolve now? Saved if the bar is full, otherwise the track is PURGED to the tombstone.")) return
    if (action === "void" && !confirm("Void this event? It just cancels — burns already made stay burned.")) return
    setActing(event_id + action); setMsg("")
    try {
      const res = await fetch("/api/admin/danger", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ action, event_id }),
      })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      if (data.result) setMsg(data.result.status === "saved" ? `Saved — raised ${data.result.raised}` : `Purged — track sent to the tombstone (raised ${data.result.raised})`)
      load()
    } catch (e: any) { setMsg(e.message) } finally { setActing(null) }
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-pink-500" />
        <h1 className="text-2xl font-bold text-white">Danger Zone</h1>
        <span className="text-sm text-zinc-500">Put a beloved track on the chopping block</span>
      </div>

      {msg && <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">{msg}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Plus className="h-4 w-4" /> Launch Event</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-zinc-400">Track to threaten {selectedTrack ? <span className="text-pink-400">· {selectedTrack.title}</span> : <span className="text-zinc-500">(pick one)</span>}</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search" className="w-40 rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-white" />
              </div>
            </div>
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-zinc-800 p-2 sm:grid-cols-2">
              {filteredTracks.map((t) => {
                const on = selTrack === t.id
                return (
                  <button key={t.id} type="button" onClick={() => setSelTrack(t.id)}
                    className={"flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition " + (on ? "border-pink-500 bg-pink-500/10 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600")}>
                    <span className="min-w-0 truncate"><span className="font-medium">{t.title}</span> <span className="text-zinc-500">{t.artist}</span></span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase text-zinc-500">{t.mood}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Rally message (shown to users)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Save 100x — the realest anthem on here" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Countdown</label>
              <div className="flex gap-2">
                <Input type="number" min="1" value={durVal} onChange={(e) => setDurVal(e.target.value)} placeholder="24" className="flex-1" />
                <select value={durUnit} onChange={(e) => setDurUnit(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-white">
                  <option value="minutes">min</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Rescue threshold (points)</label>
              <Input type="number" min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="50000" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">Rescue points: ~1 per $ONUS burned, +1 per tap (max 50/user), +25 per share. Set the threshold to the burn you want it to take to save the track.</p>

          <Button onClick={launch} disabled={acting === "create"} className="bg-pink-500 text-white hover:bg-pink-600">
            {acting === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Launch Event
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-white">Events</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> loading</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-zinc-500">No events yet. Launch one above.</div>
          ) : (
            <div className="space-y-2">
              {events.map((e) => {
                const pct = e.threshold > 0 ? Math.min(100, Math.round((e.raised / e.threshold) * 100)) : 0
                return (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{e.track_title}</span>
                        <span className="text-xs text-zinc-500">{e.track_artist}</span>
                        <Badge className={STATUS_STYLE[e.status] || ""}>{e.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        <Flame className="inline h-3 w-3 text-pink-400" /> {e.raised.toLocaleString()} / {e.threshold.toLocaleString()} ({pct}%)
                        {", ends " + new Date(e.ends_at).toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 italic truncate max-w-md">{e.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.status === "live" && (
                        <>
                          <Button onClick={() => act(e.id, "resolve")} disabled={acting === e.id + "resolve"} className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">
                            {acting === e.id + "resolve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} Resolve
                          </Button>
                          <Button onClick={() => act(e.id, "void")} disabled={acting === e.id + "void"} className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                            {acting === e.id + "void" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void
                          </Button>
                        </>
                      )}
                    </div>
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
