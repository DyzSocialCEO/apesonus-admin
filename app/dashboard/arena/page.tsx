"use client"

/**
 * /dashboard/arena — Arena Desk.
 *
 * Create daily head-to-head matches (or a short TEST match to watch the loop
 * fire fast), set stake limits, watch the live backing split, and settle with
 * one click. Winner = the artist with more qualified streams in the window; the
 * winning side splits the whole pool. Empty matches can be cancelled; matches
 * with stakes must be settled. The settle cron also closes matches automatically
 * ~5 min after close.
 */

import { useEffect, useMemo, useState } from "react"
import { Swords, Loader2, PlayCircle, Trash2, Clock, Check, Trophy } from "lucide-react"

type Match = {
  id: number; artist_a: string; artist_b: string; name_a: string; name_b: string
  opens_at: string; closes_at: string; status: string; winner: string | null
  a_streams: number; b_streams: number; total_pool: number; pool_a: number; pool_b: number
  min_stake: number; max_stake: number | null; per_user_cap: number; settled_at: string | null; pick_count: number
}

const fmt = (n: number) => (n || 0).toLocaleString("en-US")

function useCountdown(target: string | null | undefined): { label: string; done: boolean } {
  const [state, setState] = useState({ label: "", done: false })
  useEffect(() => {
    if (!target) { setState({ label: "", done: false }); return }
    const tick = () => {
      const ms = new Date(target).getTime() - Date.now()
      if (ms <= 0) { setState({ label: "closed", done: true }); return }
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
      setState({ label: d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`, done: false })
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [target])
  return state
}

function MatchRow({ m, onChange }: { m: Match; onChange: () => void }) {
  const cd = useCountdown(m.closes_at)
  const [busy, setBusy] = useState<"settle" | "delete" | null>(null)
  const settled = m.status === "settled"
  const aPct = m.total_pool > 0 ? Math.round((m.pool_a / m.total_pool) * 100) : 50

  const settle = async () => {
    setBusy("settle")
    try {
      const r = await fetch("/api/admin/arena/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) })
      const j = await r.json(); if (j.error) alert(j.error)
    } finally { setBusy(null); onChange() }
  }
  const del = async () => {
    if (!confirm(`Cancel ${m.name_a} vs ${m.name_b}?`)) return
    setBusy("delete")
    try {
      const r = await fetch(`/api/admin/arena?id=${m.id}`, { method: "DELETE" })
      const j = await r.json(); if (j.error) alert(j.error)
    } finally { setBusy(null); onChange() }
  }

  const winName = m.winner === "a" ? m.name_a : m.winner === "b" ? m.name_b : m.winner === "tie" ? "Tie" : null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white font-semibold">
            {m.name_a} <span className="text-gray-500">vs</span> {m.name_b}
          </div>
          <div className="text-[12px] text-gray-400 mt-0.5 font-mono">
            #{m.id} · {m.pick_count} stake{m.pick_count === 1 ? "" : "s"} · pool {fmt(m.total_pool)} · min {fmt(m.min_stake)}{m.max_stake ? ` · max ${fmt(m.max_stake)}` : ""} · cap {m.per_user_cap}
          </div>
        </div>
        {settled ? (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Trophy className="w-4 h-4" /> {winName} · {fmt(m.a_streams)}–{fmt(m.b_streams)}
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-sm text-gray-300">
            <Clock className="w-4 h-4 text-primary" /> {cd.label}
          </div>
        )}
      </div>

      {!settled && (
        <div className="mt-3">
          <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-800">
            <div style={{ width: `${aPct}%`, background: "#c6ff2e" }} />
            <div style={{ width: `${100 - aPct}%`, background: "#8b7cff" }} />
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-gray-500">
            <span>{fmt(m.pool_a)} {m.name_a}</span>
            <span>{fmt(m.pool_b)} {m.name_b}</span>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {!settled && (
          <button onClick={settle} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 border border-primary/40 px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50">
            {busy === "settle" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />} Settle now
          </button>
        )}
        {m.pick_count === 0 && !settled && (
          <button onClick={del} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-900 bg-red-950/40 px-3 py-1.5 text-[13px] font-semibold text-red-300 hover:bg-red-950/70 disabled:opacity-50">
            {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Cancel
          </button>
        )}
        {settled && <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500"><Check className="w-3.5 h-3.5" /> settled</span>}
      </div>
    </div>
  )
}

export default function ArenaDeskPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [roster, setRoster] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  const [artistA, setArtistA] = useState("lola-likwidity")
  const [artistB, setArtistB] = useState("dj-dustwallet")
  const [mode, setMode] = useState<"daily" | "test">("test")
  const [hours, setHours] = useState("24")
  const [testMins, setTestMins] = useState("5")
  const [minStake, setMinStake] = useState("10")
  const [maxStake, setMaxStake] = useState("")
  const [cap, setCap] = useState("25")
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState("")

  const load = () => {
    setLoading(true); setErr("")
    fetch("/api/admin/arena", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return }
      setMatches(d.matches || []); setRoster(d.roster || {})
    }).catch(() => setErr("Could not reach the server")).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const slugs = useMemo(() => Object.keys(roster), [roster])

  const create = async () => {
    setMsg("")
    if (artistA === artistB) { setMsg("Pick two different artists."); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/arena", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_a: artistA, artist_b: artistB, mode,
          hours: Number(hours), test_minutes: Number(testMins),
          min_stake: Number(minStake), max_stake: maxStake ? Number(maxStake) : null, per_user_cap: Number(cap),
        }),
      })
      const j = await res.json()
      if (j.error) { setMsg(j.error); return }
      setMsg(`Match #${j.id} created — closes ${new Date(j.closes_at).toLocaleString()}`)
      load()
    } catch { setMsg("Create failed.") }
    finally { setCreating(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  const Picker = ({ value, set, exclude }: { value: string; set: (v: string) => void; exclude: string }) => (
    <select value={value} onChange={(e) => set(e.target.value)}
      className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white">
      {slugs.map((s) => <option key={s} value={s} disabled={s === exclude}>{roster[s]}</option>)}
    </select>
  )

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6"><Swords className="w-6 h-6 text-primary" /><h1 className="text-xl font-bold text-white">Arena Desk</h1></div>
      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {/* Create */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-5 mb-8">
        <div className="text-sm font-semibold text-white mb-4">New head-to-head</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Side A</label>
            <Picker value={artistA} set={setArtistA} exclude={artistB} />
          </div>
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Side B</label>
            <Picker value={artistB} set={setArtistB} exclude={artistA} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Window</label>
            <div className="flex rounded-md overflow-hidden border border-gray-700">
              {(["test", "daily"] as const).map((mm) => (
                <button key={mm} onClick={() => setMode(mm)}
                  className={`flex-1 py-2 text-[13px] font-semibold ${mode === mm ? "bg-primary/20 text-primary" : "bg-gray-900 text-gray-400"}`}>
                  {mm === "test" ? "Test" : "Daily"}
                </button>
              ))}
            </div>
          </div>
          {mode === "test" ? (
            <div>
              <label className="block text-[12px] text-gray-400 mb-1">Minutes</label>
              <input value={testMins} onChange={(e) => setTestMins(e.target.value)} inputMode="numeric"
                className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
          ) : (
            <div>
              <label className="block text-[12px] text-gray-400 mb-1">Hours</label>
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric"
                className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
          )}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Min stake</label>
            <input value={minStake} onChange={(e) => setMinStake(e.target.value)} inputMode="numeric"
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Max (blank = none)</label>
            <input value={maxStake} onChange={(e) => setMaxStake(e.target.value)} inputMode="numeric" placeholder="—"
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">Per-user stream cap</label>
            <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric"
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button onClick={create} disabled={creating}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} Create match
            </button>
          </div>
        </div>
        {msg && <div className="mt-3 text-[13px] text-gray-300">{msg}</div>}
      </div>

      {/* List */}
      <div className="text-sm font-semibold text-white mb-3">Matches</div>
      {matches.length === 0 ? (
        <div className="text-sm text-gray-400">No matches yet. Create the first head-to-head above.</div>
      ) : (
        <div className="space-y-3">{matches.map((m) => <MatchRow key={m.id} m={m} onChange={load} />)}</div>
      )}
    </div>
  )
}
