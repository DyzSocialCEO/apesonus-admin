"use client"

/**
 * /dashboard/war — War Desk.
 *
 * Run the Kingdom War season: edit the live season's dates and Ember prize
 * pool (this is how Season 1 gets seeded with real launch dates), watch the
 * six-kingdom standings and rosters, and settle the season when it ends.
 * Settle is one click behind a typed confirmation — it runs the final decay
 * tick, picks the winner, splits the pool by season contribution
 * (largest-remainder, sum exactly = pool) and locks the season forever.
 */

import { useEffect, useState } from "react"
import { Swords, Loader2, Save, Check, Crown, Trophy, Plus } from "lucide-react"

type Season = {
  id: number; name: string; status: string; is_current: boolean
  started_at: string; enrollment_ends_at: string; scheduled_end_at: string | null
  ended_at: string | null; settled_at: string | null
  ember_prize_pool: number; winner_kingdom_id: string | null
}
type Standing = { kingdom_id: string; name: string; emoji: string; color: string; population: number; score: number; rank: number }
type Roster = { count: number; recent: { name: string; pledged_at: string }[] }
type Data = { seasons: Season[]; standings: Standing[]; rosters: Record<string, Roster>; conviction_enabled: boolean }

const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const toLocalInput = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function WarDeskPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState("")

  const [name, setName] = useState("")
  const [startedAt, setStartedAt] = useState("")
  const [enrollEnds, setEnrollEnds] = useState("")
  const [schedEnd, setSchedEnd] = useState("")
  const [pool, setPool] = useState("0")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState("")

  const [settleConfirm, setSettleConfirm] = useState("")
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState("")

  const [newName, setNewName] = useState("")
  const [newDays, setNewDays] = useState("7")
  const [newPool, setNewPool] = useState("0")
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true); setLoadErr("")
    fetch("/api/admin/war", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({} as Record<string, unknown>))
        if (!r.ok || (data as { error?: string }).error) {
          setLoadErr((data as { error?: string }).error || `Server error (${r.status})`); setD(null); return
        }
        const dd = data as Data
        setD(dd)
        const cur = dd.seasons.find((s) => s.is_current)
        if (cur) {
          setName(cur.name)
          setStartedAt(toLocalInput(cur.started_at))
          setEnrollEnds(toLocalInput(cur.enrollment_ends_at))
          setSchedEnd(toLocalInput(cur.scheduled_end_at))
          setPool(String(cur.ember_prize_pool || 0))
        }
      })
      .catch(() => setLoadErr("Could not reach the server"))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const current = d?.seasons.find((s) => s.is_current) || null
  const past = (d?.seasons || []).filter((s) => !s.is_current)

  const saveSeason = async () => {
    if (!current) return
    setSaving(true); setErr(""); setSaved(false)
    try {
      const res = await fetch("/api/admin/war", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season_id: current.id,
          name,
          started_at: startedAt ? new Date(startedAt).toISOString() : undefined,
          enrollment_ends_at: enrollEnds ? new Date(enrollEnds).toISOString() : undefined,
          scheduled_end_at: schedEnd ? new Date(schedEnd).toISOString() : undefined,
          ember_prize_pool: Number(pool),
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not save"); return }
      setSaved(true); setTimeout(() => setSaved(false), 1800)
      load()
    } catch { setErr("Could not save") }
    finally { setSaving(false) }
  }

  const settle = async () => {
    if (!current || settleConfirm !== "SETTLE") return
    setSettling(true); setSettleMsg("")
    try {
      const res = await fetch("/api/admin/war", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", season_id: current.id }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setSettleMsg(j.error || "Settle failed"); return }
      setSettleMsg(
        j.ok
          ? `Settled. Winner: ${j.winner_kingdom_id || "nobody"} — ${fmt(j.embers_paid || 0)} Embers to ${fmt(j.members_paid || 0)} members.`
          : `Refused: ${j.reason}`,
      )
      setSettleConfirm("")
      load()
    } catch { setSettleMsg("Settle failed") }
    finally { setSettling(false) }
  }

  const createSeason = async () => {
    if (!newName.trim()) return
    setCreating(true); setErr("")
    try {
      const res = await fetch("/api/admin/war", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newName.trim(), enrollment_days: Number(newDays) || 7, ember_prize_pool: Number(newPool) || 0 }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setErr(j.error || "Could not create season"); return }
      setNewName("")
      load()
    } catch { setErr("Could not create season") }
    finally { setCreating(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
  if (loadErr || !d) return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center gap-2 text-white font-semibold"><Swords className="w-5 h-5 text-primary" /> War Desk</div>
        <p className="text-sm text-gray-400 mt-3">Couldn&apos;t load the War Desk{loadErr ? `: ${loadErr}` : ""}.</p>
        <p className="text-xs text-gray-600 mt-1">If this page was just deployed, make sure migration 054 has been run in the database.</p>
        <button onClick={load} className="mt-4 text-sm bg-primary text-gray-950 font-semibold px-4 py-2 rounded-lg hover:bg-primary/90">Retry</button>
      </div>
    </div>
  )

  const topScore = Math.max(1, ...d.standings.map((k) => Number(k.score) || 0))

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Swords className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-white">War Desk</h1>
      </div>

      {/* ── current season ── */}
      {current ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <div className="text-white font-semibold">{current.name}</div>
            <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">{current.status}</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <label className="block">
              <span className="text-xs text-gray-500">Season name</span>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Ember prize pool (winning kingdom splits this)</span>
              <input value={pool} onChange={(e) => setPool(e.target.value)} inputMode="numeric"
                className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Season starts (contribution window opens)</span>
              <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)}
                className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Enrollment closes (kingdom choice locks)</span>
              <input type="datetime-local" value={enrollEnds} onChange={(e) => setEnrollEnds(e.target.value)}
                className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Scheduled end (public countdown target)</span>
              <input type="datetime-local" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)}
                className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex items-end gap-3">
              <button onClick={saveSeason} disabled={saving}
                className="flex items-center gap-2 bg-primary text-gray-950 font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? "Saved" : "Save season"}
              </button>
              {err && <span className="text-xs text-red-400 pb-2">{err}</span>}
            </div>
          </div>

          {/* settle */}
          <div className="mt-5 pt-4 border-t border-gray-800">
            <div className="text-sm text-white font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Settle the season</div>
            <p className="text-xs text-gray-500 mt-1">
              Runs the final decay tick, picks the winning kingdom, splits the Ember pool by each
              member&apos;s own season contribution, and locks the season. Cannot be undone or run twice.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <input value={settleConfirm} onChange={(e) => setSettleConfirm(e.target.value)} placeholder='Type SETTLE to arm'
                className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white w-48" />
              <button onClick={settle} disabled={settling || settleConfirm !== "SETTLE"}
                className="flex items-center gap-2 bg-red-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-500 disabled:opacity-40 text-sm">
                {settling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                Settle season
              </button>
            </div>
            {settleMsg && <p className="text-xs mt-2 text-gray-300">{settleMsg}</p>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="text-white font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> New season</div>
          <p className="text-xs text-gray-500 mt-1">No season is current. Create the next one to reopen enrollment.</p>
          <div className="grid md:grid-cols-3 gap-4 mt-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Season 2: ..."
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            <input value={newDays} onChange={(e) => setNewDays(e.target.value)} placeholder="Enrollment days" inputMode="numeric"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
            <input value={newPool} onChange={(e) => setNewPool(e.target.value)} placeholder="Ember prize pool" inputMode="numeric"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <button onClick={createSeason} disabled={creating || !newName.trim()}
            className="mt-3 flex items-center gap-2 bg-primary text-gray-950 font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create season
          </button>
          {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        </div>
      )}

      {/* ── standings ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold">Standings</div>
        <p className="text-xs text-gray-500 mt-0.5">Live weighted score (decays hourly) and population, per kingdom.</p>
        <div className="mt-4 space-y-3">
          {d.standings.map((k) => (
            <div key={k.kingdom_id} className="flex items-center gap-3">
              <span className="w-5 text-center text-sm text-gray-500">{k.rank}</span>
              <span className="text-lg">{k.emoji}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{k.name}</span>
                  <span className="text-gray-400">{fmt(k.population)} citizens · {fmt(Math.round(Number(k.score)))} wt</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-800 mt-1.5">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round((Number(k.score) / topScore) * 100))}%`, background: k.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── rosters ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold">Rosters</div>
        <p className="text-xs text-gray-500 mt-0.5">Current season pledges. Newest 15 per kingdom shown.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {d.standings.map((k) => {
            const r = d.rosters[k.kingdom_id]
            return (
              <div key={k.kingdom_id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{k.emoji} {k.name}</span>
                  <span className="text-gray-500">{fmt(r?.count || 0)}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {(r?.recent || []).map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-gray-400">
                      <span className="truncate">{m.name}</span>
                      <span className="text-gray-600 shrink-0 ml-2">{new Date(m.pledged_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {!r?.count && <p className="text-xs text-gray-600">No pledges yet.</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── past seasons ── */}
      {past.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="text-white font-semibold">Past seasons</div>
          <div className="mt-3 space-y-2">
            {past.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2 last:border-0">
                <span className="text-gray-300">{s.name}</span>
                <span className="text-gray-500 text-xs">
                  {s.settled_at
                    ? `settled ${new Date(s.settled_at).toLocaleDateString()} · winner: ${s.winner_kingdom_id || "nobody"} · pool ${fmt(s.ember_prize_pool)}`
                    : s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
