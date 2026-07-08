"use client"

/**
 * /dashboard/cosign — Backing Desk.
 *
 * Run the weekly backing round. Set the Spins prize pool, choose the real
 * Sunday→Saturday schedule or a short TEST round (e.g. 5 minutes) to watch the
 * whole loop fire fast. Watch the live artist race, preview the timestamp-
 * weighted split, and settle with one click. NO DRAW: everyone who backed the
 * winning artist wins — the pool splits by lock-in time, earlier = bigger.
 * Nobody right → the pool stays with the house.
 */

import { useEffect, useMemo, useState } from "react"
import { PenLine, Loader2, Save, Check, Trophy, PlayCircle, Clock, Trash2 } from "lucide-react"

type Race = { rank: number; artist: string; streams: number; backers: number }
type Slot = { place: number; ts: string; spins: number }
type Preview = { winner_artist?: string; backers: number; pool_spins?: number; alpha?: number; slots?: Slot[] }
type Round = { week_start: string; sponsor: string | null; sponsor_url: string | null; currency: string; token_mint: string | null; total_pool_value: number; opens_at: string; closes_at: string; status: string; live_url?: string | null }
type Hist = { week_start: string; sponsor: string | null; total_pool_value: number; currency: string; draw_summary: any }
type Data = { round: Round | null; race: Race[]; preview: Preview; history: Hist[] }

const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const fmtV = (n: number) => (Number.isInteger(n) ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString("en-US"))
const curLabel = (c?: string) => (c === "usdc" ? "USDC" : c === "spins" ? "Spins" : "TOKEN")

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

export default function BackingDeskPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  const [sponsor, setSponsor] = useState("")
  const [sponsorUrl, setSponsorUrl] = useState("")
  const [poolVal, setPoolVal] = useState("")
  const [liveUrl, setLiveUrl] = useState("")
  const [mode, setMode] = useState<"weekly" | "test">("test")
  const [testMins, setTestMins] = useState("5")
  const [saving, setSaving] = useState(false)
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState("")

  const load = () => {
    setLoading(true); setErr("")
    fetch("/api/admin/cosign", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      if (data.error) { setErr(data.error); return }
      setD(data)
      if (data.round) {
        setSponsor(data.round.sponsor || ""); setSponsorUrl(data.round.sponsor_url || "")
        setPoolVal(String(data.round.total_pool_value || "")); setLiveUrl(data.round.live_url || "")
      }
    }).catch(() => setErr("Could not reach the server")).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const cd = useCountdown(d?.round?.closes_at)

  const openRound = async () => {
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/cosign/pool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name: sponsor, sponsor_url: sponsorUrl, pool_spins: Number(poolVal), live_url: liveUrl,
          round_mode: mode, test_minutes: mode === "test" ? Number(testMins) : undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not open round"); return }
      load()
    } catch { setErr("Could not open round") } finally { setSaving(false) }
  }

  const settleNow = async () => {
    if (!window.confirm("Settle now? The #1 artist wins, every backer of theirs gets their time-weighted Spins slice, and the winner list is sealed on-chain.")) return
    setSettling(true); setSettleMsg("")
    try {
      const res = await fetch("/api/admin/cosign/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const j = await res.json()
      if (!res.ok) { setSettleMsg(j.error || "Settle failed"); return }
      const r = j.result || {}
      setSettleMsg(r.winner ? `Winner: ${r.winner} · ${r.winners} winners · ${fmtV(r.paid || 0)} Spins paid` : "No streams in window — nothing to settle")
      load()
    } catch { setSettleMsg("Settle failed") } finally { setSettling(false) }
  }

  const resetRound = async (alsoCalls: boolean) => {
    if (!window.confirm((alsoCalls ? "Delete this round AND wipe all backings?" : "Delete this round?") + " Cannot be undone.")) return
    const res = await fetch(`/api/admin/cosign/pool?calls=${alsoCalls ? 1 : 0}`, { method: "DELETE" })
    if (res.ok) { setSponsor(""); setSponsorUrl(""); setPoolVal(""); load() }
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1.5"

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  const round = d?.round

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6"><PenLine className="w-6 h-6 text-primary" /><h1 className="text-xl font-bold text-white">Backing Desk</h1></div>
      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {/* Status banner */}
      <div className={`mb-6 rounded-xl px-5 py-4 border ${round ? (cd.done ? "border-amber-500/40 bg-amber-500/5" : "border-primary/40 bg-primary/5") : "border-gray-800 bg-gray-900"}`}>
        {round ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-white font-semibold">
                {cd.done ? "ROUND CLOSED — ready to settle" : "ROUND OPEN — backing live in the app"}
              </div>
              <div className="text-[12px] text-gray-400 mt-1">
                {fmtV(round.total_pool_value)} Spins pool{round.sponsor ? ` · ${round.sponsor}` : ""} · closes {new Date(round.closes_at).toUTCString()}
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <Clock className="w-4 h-4 text-primary" />
              <span className={`text-lg font-bold ${cd.done ? "text-amber-400" : "text-primary"}`}>{cd.label || "—"}</span>
            </div>
          </div>
        ) : <div className="text-sm text-gray-400">No round running. Open one below.</div>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Round setup */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Save className="w-4 h-4 text-primary" /> {round ? "Update / reopen round" : "Open a round"}</div>

          <div className="mb-3">
            <label className={label}>Schedule</label>
            <div className="flex gap-1.5 bg-gray-950 border border-gray-800 rounded-lg p-1">
              <button onClick={() => setMode("weekly")} className={`flex-1 text-xs py-2 rounded-md font-semibold ${mode === "weekly" ? "bg-primary text-gray-950" : "text-gray-400"}`}>Weekly (Sun→Sat UTC)</button>
              <button onClick={() => setMode("test")} className={`flex-1 text-xs py-2 rounded-md font-semibold ${mode === "test" ? "bg-primary text-gray-950" : "text-gray-400"}`}>Test round</button>
            </div>
            {mode === "test" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">Runs for</span>
                <input className="w-20 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-white" value={testMins} onChange={(e) => setTestMins(e.target.value)} inputMode="numeric" />
                <span className="text-xs text-gray-400">minutes, starting now</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Sponsor name (optional)</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Coinbase" /></div>
            <div><label className={label}>Sponsor link</label><input className={input} value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://..." /></div>
            <div className="col-span-2"><label className={label}>Prize pool (Spins)</label><input className={input} value={poolVal} onChange={(e) => setPoolVal(e.target.value)} inputMode="numeric" placeholder="10000" /></div>
            <div className="col-span-2"><label className={label}>Live stream URL (Mux / YouTube / HLS) — optional, shown on /live during the draw</label><input className={input} value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://stream.mux.com/... or a Mux playback ID" /></div>
          </div>

          <div className="mt-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-gray-400">
            <span className="text-primary">No draw.</span> Everyone who backs the winning artist wins — the Spins pool splits by lock-in time (earlier = bigger slice). Min-Spins entry gate + curve steepness live in app_settings (<span className="font-mono">cosign_min_spins</span>, <span className="font-mono">cosign_weight_alpha</span>). Nobody right → pool stays with the house.
          </div>

          <button onClick={openRound} disabled={saving} className="mt-4 w-full bg-primary text-gray-950 font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}{round ? "Reopen / update round" : "Open round"}
          </button>

          {round && (
            <div className="mt-3 flex gap-2">
              <button onClick={settleNow} disabled={settling} className="flex-1 text-xs py-2 rounded-lg border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50 flex items-center justify-center gap-1">
                {settling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trophy className="w-3 h-3" />} Settle the round
              </button>
              <button onClick={() => resetRound(true)} className="flex-1 text-xs py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-400 flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> Reset</button>
            </div>
          )}
          {settleMsg && <div className="mt-3 text-sm text-gray-300">{settleMsg}</div>}
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Trophy className="w-4 h-4 text-primary" /> If it settled now</div>
          {d?.preview?.winner_artist ? (
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Winning artist</span><span className="text-white font-medium">{d.preview.winner_artist}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Winners (all backers)</span><span className="text-white font-mono">{d.preview.backers}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Pool · curve</span><span className="text-white font-mono">{fmtV(d.preview.pool_spins || 0)} Spins · α={d.preview.alpha ?? 1}</span></div>
              <div className="pt-2 border-t border-gray-800 space-y-1">
                <div className="text-[11px] text-gray-500 mb-1">Time-weighted split (earliest first{(d.preview.backers || 0) > 8 ? ", first 8 shown" : ""})</div>
                {(d.preview.slots || []).map((sl) => (
                  <div key={sl.place} className="flex justify-between text-xs">
                    <span className="text-gray-300">#{sl.place} · locked {new Date(sl.ts).toUTCString().replace(" GMT", " UTC")}</span>
                    <span className="text-white font-mono">{fmtV(sl.spins)} Spins</span>
                  </div>
                ))}
                {d.preview.backers === 0 && <div className="text-xs text-gray-600">Nobody has backed them yet — pool would stay with the house.</div>}
              </div>
            </div>
          ) : <p className="text-sm text-gray-500 py-6 text-center">No streams in the round window yet.</p>}
        </div>
      </div>

      {/* Race */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Live race · artists by total streams (this round)</div>
        {!d || d.race.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No streams in the round window yet.</p> : (
          <div className="space-y-1.5">
            {d.race.map((r) => (
              <div key={r.artist} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                <span className={`font-mono text-sm w-6 text-center ${r.rank === 1 ? "text-primary font-bold" : "text-gray-500"}`}>{String(r.rank).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0 text-sm text-white truncate">{r.artist}</div>
                <div className="text-right"><div className="text-sm text-white font-mono">{fmt(r.streams)}</div><div className="text-[10px] text-gray-600">streams</div></div>
                <div className="text-right w-16"><div className="text-sm font-mono text-purple-400">{fmt(r.backers)}</div><div className="text-[10px] text-gray-600">backed</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Settled rounds</div>
        {!d || d.history.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Nothing settled yet.</p> : (
          <div className="space-y-2">
            {d.history.map((h) => (
              <div key={h.week_start} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white">{h.draw_summary?.winner || "—"} <span className="text-gray-500 text-xs">· {h.sponsor || "no sponsor"}</span></div>
                  <div className="text-sm font-mono text-primary">{fmtV(h.draw_summary?.paid || 0)} {h.draw_summary?.model === "skill_split" ? "Spins" : curLabel(h.currency)}</div>
                </div>
                <div className="text-[11px] text-gray-600 mt-0.5">{h.draw_summary?.winners ?? 0} winners · {h.draw_summary?.backers ?? 0} backed · round {h.week_start}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
