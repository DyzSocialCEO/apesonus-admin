"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Zap, Loader2, Plus, Trash2, Play, Ban, Search } from "lucide-react"

type Track = { id: number; title: string; artist: string; mood: string }
type Arena = {
  id: string; title: string; genre: string; status: string
  cycle_seconds: number; opens_at: string | null; reveal_at: string | null
  min_back: number; max_back: number | null; created_at: string
}

const GENRES = ["ALL", "REKT", "MOON", "DEGEN", "COPE", "ZEN"]
const UNITS: Record<string, number> = { minutes: 60, hours: 3600, days: 86400 }
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300",
  open: "bg-emerald-500/15 text-emerald-400",
  revealing: "bg-amber-500/15 text-amber-400",
  settled: "bg-blue-500/15 text-blue-400",
  void: "bg-red-500/15 text-red-400",
}

function fmtCycle(secs: number) {
  if (secs % 86400 === 0) return (secs / 86400) + "d"
  if (secs % 3600 === 0) return (secs / 3600) + "h"
  if (secs % 60 === 0) return (secs / 60) + "m"
  return secs + "s"
}

export default function ArenasPage() {
  const [arenas, setArenas] = useState<Arena[]>([])
  const [arenaTracks, setArenaTracks] = useState<Record<string, number[]>>({})
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  const [title, setTitle] = useState("")
  const [genre, setGenre] = useState("ALL")
  const [cycleVal, setCycleVal] = useState("")
  const [cycleUnit, setCycleUnit] = useState("hours")
  const [minBack, setMinBack] = useState("0")
  const [maxBack, setMaxBack] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState("")

  async function load() {
    try {
      const res = await fetch("/api/admin/arenas", { credentials: "include" })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      setArenas(data.arenas || [])
      setArenaTracks(data.arenaTracks || {})
      setTracks(data.tracks || [])
    } catch (e: any) { setMsg(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
  }, [tracks, search])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createArena() {
    const cycle_seconds = (Number(cycleVal) || 0) * (UNITS[cycleUnit] || 3600)
    if (!title.trim()) { setMsg("title required"); return }
    if (cycle_seconds <= 0) { setMsg("set a cycle length"); return }
    if (selected.size < 2) { setMsg("pick at least 2 tracks"); return }
    setActing("create"); setMsg("")
    try {
      const res = await fetch("/api/admin/arenas", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          action: "create", title: title.trim(), genre, cycle_seconds,
          min_back: minBack, max_back: maxBack, track_ids: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      setTitle(""); setCycleVal(""); setMinBack("0"); setMaxBack(""); setSelected(new Set()); setGenre("ALL")
      setMsg("arena created (draft)")
      load()
    } catch (e: any) { setMsg(e.message) } finally { setActing(null) }
  }

  async function act(arena_id: string, action: string) {
    if (action === "delete" && !confirm("Delete this arena?")) return
    setActing(arena_id + action); setMsg("")
    try {
      const res = await fetch("/api/admin/arenas", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ action, arena_id }),
      })
      const data = await res.json()
      if (data.error) { setMsg(data.error); return }
      load()
    } catch (e: any) { setMsg(e.message) } finally { setActing(null) }
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-[#c6ff2e]" />
        <h1 className="text-2xl font-bold text-white">Arena</h1>
        <span className="text-sm text-zinc-500">Blind Backing Arena cycles</span>
      </div>

      {msg && <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">{msg}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Plus className="h-4 w-4" /> Create Arena</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cycle 07" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Genre</label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white">
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Cycle length</label>
              <div className="flex gap-2">
                <Input type="number" min="1" value={cycleVal} onChange={(e) => setCycleVal(e.target.value)} placeholder="48" className="flex-1" />
                <select value={cycleUnit} onChange={(e) => setCycleUnit(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-white">
                  <option value="minutes">min</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Min back ($ONUS)</label>
              <Input type="number" min="0" value={minBack} onChange={(e) => setMinBack(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Max back (optional)</label>
              <Input type="number" min="0" value={maxBack} onChange={(e) => setMaxBack(e.target.value)} placeholder="no cap" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-zinc-400">Tracks in this arena <span className="text-zinc-500">({selected.size} selected)</span></label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search" className="w-40 rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-white" />
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-zinc-800 p-2 sm:grid-cols-2">
              {filteredTracks.map((t) => {
                const on = selected.has(t.id)
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t.id)}
                    className={"flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition " + (on ? "border-[#c6ff2e] bg-[#c6ff2e]/10 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600")}>
                    <span className="min-w-0 truncate"><span className="font-medium">{t.title}</span> <span className="text-zinc-500">{t.artist}</span></span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase text-zinc-500">{t.mood}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <Button onClick={createArena} disabled={acting === "create"} className="bg-[#c6ff2e] text-black hover:bg-[#b3e827]">
            {acting === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Arena
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-white">Arenas</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> loading</div>
          ) : arenas.length === 0 ? (
            <div className="text-sm text-zinc-500">No arenas yet. Create one above.</div>
          ) : (
            <div className="space-y-2">
              {arenas.map((a) => {
                const trackCount = (arenaTracks[a.id] || []).length
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{a.title}</span>
                        <Badge className={STATUS_STYLE[a.status] || ""}>{a.status}</Badge>
                        <Badge className="bg-zinc-700/40 text-zinc-300">{a.genre}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {fmtCycle(a.cycle_seconds)} cycle, {trackCount} tracks, min {a.min_back}{a.max_back ? ", max " + a.max_back : ""}
                        {a.reveal_at ? ", reveals " + new Date(a.reveal_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.status === "draft" && (
                        <Button onClick={() => act(a.id, "open")} disabled={acting === a.id + "open"} className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30">
                          {acting === a.id + "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Open
                        </Button>
                      )}
                      {(a.status === "open" || a.status === "draft") && (
                        <Button onClick={() => act(a.id, "void")} disabled={acting === a.id + "void"} className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                          {acting === a.id + "void" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void
                        </Button>
                      )}
                      {a.status !== "open" && (
                        <Button onClick={() => act(a.id, "delete")} disabled={acting === a.id + "delete"} className="bg-red-500/15 text-red-300 hover:bg-red-500/25">
                          {acting === a.id + "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
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
