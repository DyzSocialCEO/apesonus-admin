"use client"

/**
 * /dashboard/cosign — Co-Sign Desk.
 *
 * Set this week's Spins reward and sponsor, watch the live race (tracks by
 * unique listeners with co-sign counts), and see the settlement preview: what
 * would pay out to the first-100 signers on the current #1 if it settled now.
 * Below, the history of settled weeks and a by-hand settle for testing or a
 * missed cron run. Settlement itself runs weekly Monday 00:05 UTC.
 */

import { useEffect, useState } from "react"
import { PenLine, Loader2, Save, Check, Trophy, PlayCircle } from "lucide-react"

type RaceRow = { rank: number; track_id: number; title: string; artist: string; ears: number; cosigns: number }
type Preview = { winner_title?: string; signers: number; total_shares: number; per_share: number; total_paid: number }
type Hist = { week_start: string; sponsor: string | null; pool_spins: number; winner_title: string | null; signers: number; paid: number }
type Data = {
  week_start: string
  pool: { sponsor: string | null; pool_spins: number; status: string } | null
  race: RaceRow[]; preview: Preview; history: Hist[]
}

const fmt = (n: number) => (n || 0).toLocaleString("en-US")

export default function CoSignDeskPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [sponsor, setSponsor] = useState("")
  const [spins, setSpins] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [week, setWeek] = useState("")
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState("")

  const load = () => {
    setLoading(true); setErr("")
    fetch("/api/admin/cosign", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErr(data.error); return }
        setD(data)
        if (data.pool) { setSponsor(data.pool.sponsor || ""); setSpins(String(data.pool.pool_spins || "")) }
      })
      .catch(() => setErr("Could not reach the server"))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const savePool = async () => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/admin/cosign/pool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsor_name: sponsor, pool_spins: Number(spins) }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not save"); return }
      setSaved(true); setTimeout(() => setSaved(false), 1800); load()
    } catch { setErr("Could not save") }
    finally { setSaving(false) }
  }

  const settle = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) { setSettleMsg("Enter that week's Monday, YYYY-MM-DD"); return }
    setSettling(true); setSettleMsg("")
    try {
      const res = await fetch("/api/admin/cosign/settle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      })
      const j = await res.json()
      if (!res.ok) { setSettleMsg(j.error || "Settle failed"); return }
      const r = j.result || {}
      setSettleMsg(r.ok === false ? `Already settled or no pool` : `Settled: ${r.signers || 0} signers, ${fmt(r.paid || 0)} Spins paid`)
      load()
    } catch { setSettleMsg("Settle failed") }
    finally { setSettling(false) }
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1.5"

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <PenLine className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-white">Co-Sign Desk</h1>
        {d && <span className="text-xs text-gray-500 ml-2">week of {d.week_start}</span>}
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pool setter */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Save className="w-4 h-4 text-primary" /> This week's reward</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Sponsor name</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="BONK" /></div>
            <div><label className={label}>Pool (Spins)</label><input className={input} value={spins} onChange={(e) => setSpins(e.target.value)} inputMode="numeric" placeholder="25000" /></div>
          </div>
          <button onClick={savePool} disabled={saving}
            className="mt-4 w-full bg-primary text-gray-950 font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved" : "Save pool"}
          </button>
          <p className="text-[11px] text-gray-600 mt-2">First 100 signers on this week's #1 track share it: positions 1–10 / 11–50 / 51–100 get 3 / 2 / 1 shares.</p>
        </div>

        {/* Settlement preview */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Trophy className="w-4 h-4 text-primary" /> If it settled now</div>
          {d?.preview?.winner_title ? (
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm"><span className="text-gray-400">#1 track</span><span className="text-white font-medium">{d.preview.winner_title}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Signers paid</span><span className="text-white font-mono">{d.preview.signers} <span className="text-gray-600">/ 100 max</span></span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Total shares</span><span className="text-white font-mono">{d.preview.total_shares}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Per share</span><span className="text-white font-mono">{fmt(d.preview.per_share)} Spins</span></div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-800"><span className="text-gray-400">Total payout</span><span className="text-primary font-mono font-bold">{fmt(d.preview.total_paid)} Spins</span></div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-6 text-center">No tracks with listeners yet this week.</p>
          )}
        </div>
      </div>

      {/* Live race */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Live race · unique listeners</div>
        {!d || d.race.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No plays yet this week.</p>
        ) : (
          <div className="space-y-1.5">
            {d.race.map((r) => (
              <div key={r.track_id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                <span className={`font-mono text-sm w-6 text-center ${r.rank === 1 ? "text-primary font-bold" : "text-gray-500"}`}>{String(r.rank).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{r.title}</div>
                  <div className="text-[11px] text-gray-500 truncate">{r.artist}</div>
                </div>
                <div className="text-right"><div className="text-sm text-white font-mono">{fmt(r.ears)}</div><div className="text-[10px] text-gray-600">ears</div></div>
                <div className="text-right w-16"><div className="text-sm font-mono text-purple-400">{fmt(r.cosigns)}</div><div className="text-[10px] text-gray-600">signed</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History + manual settle */}
      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="text-white font-semibold mb-4">Settled weeks</div>
          {!d || d.history.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Nothing settled yet.</p>
          ) : (
            <div className="space-y-2">
              {d.history.map((h) => (
                <div key={h.week_start} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                  <div>
                    <div className="text-sm text-white">{h.winner_title || "—"}</div>
                    <div className="text-[11px] text-gray-500">week of {h.week_start} · {h.signers} paid</div>
                  </div>
                  <div className="text-right"><div className="text-sm font-mono text-primary">{fmt(h.paid)}</div><div className="text-[10px] text-gray-600">Spins</div></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><PlayCircle className="w-4 h-4 text-primary" /> Settle by hand</div>
          <p className="text-[12px] text-gray-500 mb-3">Runs weekly on its own. Use this only to settle a specific past week (its Monday) for testing or a missed run.</p>
          <label className={label}>Week (Monday, UTC)</label>
          <input className={input} value={week} onChange={(e) => setWeek(e.target.value)} placeholder="2026-06-29" />
          <button onClick={settle} disabled={settling}
            className="mt-3 w-full border border-gray-700 text-white font-semibold text-sm py-2.5 rounded-lg hover:border-primary/60 disabled:opacity-50 flex items-center justify-center gap-2">
            {settling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Settle week
          </button>
          {settleMsg && <div className="mt-3 text-sm text-gray-300">{settleMsg}</div>}
        </div>
      </div>
    </div>
  )
}
