"use client"

/**
 * /dashboard/conviction — Conviction Desk.
 *
 * Run the daily memecoin survival contest. Configure a contest (every rule is
 * a dial, frozen at creation — Diamond / Gold / Sprint are just preset fills),
 * open the board, and watch the launch-feed cron fill it with verified fresh
 * Pump.fun launches. Board rows freeze their add-time mcap; live numbers
 * refresh every feed pass. Liability is ALWAYS capped at the pot ceiling,
 * known before the board opens. Entry, resolver, and payouts light up in the
 * next phases — this Desk is the config + feed window.
 */

import { useEffect, useState } from "react"
import { Gem, Loader2, PlayCircle, Trash2, RefreshCw } from "lucide-react"

type Contest = {
  id: number; contest_date: string; label: string; status: string
  entry_spins: number; target_prize_usd: number; pot_ceiling_usd: number; max_winners: number
  call_ceiling_mcap: number; floor_pct: number; final_mcap: number; days: number
  liq_floor_usd: number; snapshot_hour_utc: number
  opens_at: string; closes_at: string
}
type BoardRow = {
  token_mint: string; symbol: string | null; name: string | null; logo: string | null
  launch_ts: string | null; mcap_at_add: number; liquidity_at_add: number
  last_mcap: number; last_liquidity: number; last_seen_at: string; added_at: string
}
type Desk = {
  contests: Contest[]; focus: Contest | null; board: BoardRow[]
  call_count: number
  exposure: { max_liability_usd: number; full_prizes_possible: number } | null
}

const fmtUsd = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
const fmtN = (n: number) => Number(n || 0).toLocaleString("en-US")
const ago = (iso: string | null) => {
  if (!iso) return "—"
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 90) return `${s}s`
  if (s < 5400) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

// Preset fills — config only, the schema itself defaults to Diamond.
const PRESETS: Record<string, Partial<Record<string, string>>> = {
  Diamond: { entry_spins: "200", target_prize_usd: "1000", pot_ceiling_usd: "5000", max_winners: "5", call_ceiling_mcap: "20000", floor_pct: "0.90", final_mcap: "100000", days: "7", liq_floor_usd: "1000" },
  Gold:    { entry_spins: "400", target_prize_usd: "250",  pot_ceiling_usd: "2500", max_winners: "10", call_ceiling_mcap: "20000", floor_pct: "0.85", final_mcap: "50000",  days: "3", liq_floor_usd: "1000" },
  Sprint:  { entry_spins: "100", target_prize_usd: "50",   pot_ceiling_usd: "1000", max_winners: "20", call_ceiling_mcap: "20000", floor_pct: "0.80", final_mcap: "50000",  days: "1", liq_floor_usd: "500"  },
}
const DIALS: { key: string; label: string }[] = [
  { key: "entry_spins",       label: "Entry (Spins)" },
  { key: "target_prize_usd",  label: "Target prize (USD)" },
  { key: "pot_ceiling_usd",   label: "Pot ceiling (USD)" },
  { key: "max_winners",       label: "Max full prizes" },
  { key: "call_ceiling_mcap", label: "Call ceiling mcap (USD)" },
  { key: "floor_pct",         label: "Survival floor (× entry)" },
  { key: "final_mcap",        label: "Final-day mcap bar (USD)" },
  { key: "days",              label: "Gauntlet days" },
  { key: "liq_floor_usd",     label: "Liquidity floor (USD)" },
]

export default function ConvictionDeskPage() {
  const [d, setD] = useState<Desk | null>(null)
  const [gameEnabled, setGameEnabled] = useState<boolean | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState("")

  const [label, setLabel] = useState("Diamond")
  const [dials, setDials] = useState<Record<string, string>>({ ...PRESETS.Diamond } as Record<string, string>)
  const [mode, setMode] = useState<"daily" | "test">("daily")
  const [testMins, setTestMins] = useState("30")

  const load = (id?: number | null) => {
    fetch(`/api/admin/conviction${id ? `?contest=${id}` : ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((x: Desk) => { setD(x); if (x.focus) setFocusId(x.focus.id) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load(focusId); const t = setInterval(() => load(focusId), 20000); return () => clearInterval(t) }, [focusId])

  // Season gate status — banner only, the toggle lives in Settings.
  useEffect(() => {
    fetch("/api/admin/war", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (x) setGameEnabled(x.conviction_enabled === true) })
      .catch(() => {})
  }, [])

  const applyPreset = (name: string) => { setLabel(name); setDials({ ...(PRESETS[name] as Record<string, string>) }) }

  const create = async () => {
    setCreating(true); setMsg("")
    try {
      const body: Record<string, unknown> = { label, window_mode: mode, test_minutes: mode === "test" ? Number(testMins) : undefined }
      for (const { key } of DIALS) if (dials[key] !== "") body[key] = Number(dials[key])
      const r = await fetch("/api/admin/conviction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "create failed")
      setMsg(`Contest #${j.contest.id} open — board locks ${new Date(j.contest.closes_at).toUTCString()}`)
      setFocusId(j.contest.id); load(j.contest.id)
    } catch (e: any) { setMsg(String(e?.message || e)) } finally { setCreating(false) }
  }

  const voidContest = async (id: number) => {
    if (!window.confirm(`Void contest #${id} and clear its board? Refuses if any paid calls exist.`)) return
    const r = await fetch(`/api/admin/conviction?contest=${id}`, { method: "DELETE" })
    const j = await r.json()
    setMsg(r.ok ? `Contest #${id} voided.` : j.error || "void failed")
    load(null); setFocusId(null)
  }

  const resolveContest = async (id: number, action: "settle" | "void") => {
    const verb = action === "void" ? "Void and refund" : "Force settle"
    if (!window.confirm(verb + " contest #" + id + "?")) return
    const r = await fetch("/api/admin/conviction/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contest: id, action }) })
    const j = await r.json()
    setMsg(r.ok ? JSON.stringify(j) : (j.error || "failed"))
    load(focusId)
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const labelCls = "block text-xs text-gray-400 mb-1.5"

  const focus = d?.focus
  const board = d?.board || []
  const boardLive = board.filter((b) => focus && b.last_mcap > 0 && b.last_mcap < Number(focus.call_ceiling_mcap))

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <Gem className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold text-white">Conviction Desk</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Daily memecoin survival. Configure the gauntlet, open the board, watch it fill. Liability never exceeds the pot ceiling.</p>

      {gameEnabled === false && (
        <div className="mb-4 flex items-center gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2.5">
          <Gem className="w-4 h-4 shrink-0" />
          <span>
            Conviction is <b>disabled for Season 1</b>. The Call tab is hidden in the PWA and players see the
            Season 2 teaser. The Desk still works for prep and QA. Flip the switch in Settings when Season 2 opens,
            and re-enable the Moralis feed job on cron-job.org.
          </span>
        </div>
      )}

      {msg && <div className="mb-4 text-xs rounded-lg border border-primary/30 bg-primary/5 text-primary px-3 py-2">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        {/* ── Create contest ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">New contest</h2>
            <div className="flex gap-1.5">
              {Object.keys(PRESETS).map((p) => (
                <button key={p} onClick={() => applyPreset(p)} className={`text-xs px-2.5 py-1 rounded-md border ${label === p ? "border-primary text-primary bg-primary/10" : "border-gray-800 text-gray-400"}`}>{p}</button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className={labelCls}>Board window</label>
            <div className="flex gap-1.5 bg-gray-950 border border-gray-800 rounded-lg p-1">
              <button onClick={() => setMode("daily")} className={`flex-1 text-xs py-2 rounded-md font-semibold ${mode === "daily" ? "bg-primary text-gray-950" : "text-gray-400"}`}>Daily (locks 11:50 UTC)</button>
              <button onClick={() => setMode("test")} className={`flex-1 text-xs py-2 rounded-md font-semibold ${mode === "test" ? "bg-primary text-gray-950" : "text-gray-400"}`}>Test round</button>
            </div>
            {mode === "test" && (
              <div className="mt-2"><label className={labelCls}>Test length (minutes)</label><input className={input} value={testMins} onChange={(e) => setTestMins(e.target.value)} inputMode="numeric" /></div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {DIALS.map(({ key, label: l }) => (
              <div key={key}><label className={labelCls}>{l}</label>
                <input className={input} value={dials[key] ?? ""} onChange={(e) => setDials((s) => ({ ...s, [key]: e.target.value }))} inputMode="decimal" />
              </div>
            ))}
          </div>

          <button onClick={create} disabled={creating}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-gray-950 text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Open the board
          </button>
          <p className="mt-2 text-[11px] text-gray-600">Rules freeze on the contest row at creation. The feed cron (every 3–5 min) fills the board with fresh sub-ceiling Pump.fun launches — nothing is ever hand-added.</p>
        </div>

        {/* ── Focus contest ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Contest {focus ? `#${focus.id} · ${focus.label}` : ""}</h2>
            {focus && focus.status !== "settled" && (
              <div className="flex items-center gap-3"><button onClick={() => resolveContest(focus.id, "settle")} className="text-xs text-primary flex items-center gap-1"><PlayCircle className="w-3 h-3" /> Settle now</button><button onClick={() => resolveContest(focus.id, "void")} className="text-xs text-red-400 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Void + refund</button></div>
            )}
          </div>
          {focus ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Status</span><span className={`font-mono text-xs px-2 py-0.5 rounded ${focus.status === "open" ? "bg-primary/10 text-primary" : "bg-gray-800 text-gray-300"}`}>{focus.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Board window</span><span className="text-white font-mono text-xs">{new Date(focus.opens_at).toUTCString().slice(5, 22)} → {new Date(focus.closes_at).toUTCString().slice(5, 22)} UTC</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Gauntlet</span><span className="text-white text-xs">{focus.days}d · floor {Math.round(Number(focus.floor_pct) * 100)}% of entry · day-{focus.days} bar {fmtUsd(focus.final_mcap)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Call rules</span><span className="text-white text-xs">under {fmtUsd(focus.call_ceiling_mcap)} · liq ≥ {fmtUsd(focus.liq_floor_usd)} · {fmtN(focus.entry_spins)} Spins entry</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Prize</span><span className="text-white text-xs">{fmtUsd(focus.target_prize_usd)} each · pot cap {fmtUsd(focus.pot_ceiling_usd)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Max liability</span><span className="text-primary font-mono text-xs">{d?.exposure ? `${fmtUsd(d.exposure.max_liability_usd)} (${d.exposure.full_prizes_possible} full prizes possible)` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Calls</span><span className="text-white font-mono text-xs">{d?.call_count ?? 0} (entry opens in Phase 2)</span></div>
            </div>
          ) : <p className="text-sm text-gray-500 py-8 text-center">{loading ? "Loading…" : "No contest yet — open one."}</p>}

          {(d?.contests?.length || 0) > 1 && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <label className={labelCls}>Switch contest</label>
              <div className="flex flex-wrap gap-1.5">
                {d!.contests.slice(0, 8).map((c) => (
                  <button key={c.id} onClick={() => setFocusId(c.id)} className={`text-xs px-2 py-1 rounded border ${focusId === c.id ? "border-primary text-primary" : "border-gray-800 text-gray-400"}`}>#{c.id} {c.label} · {c.status}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── The board ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">The board <span className="text-xs text-gray-500 font-normal">{boardLive.length} callable · {board.length} sighted</span></h2>
          <button onClick={() => load(focusId)} className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
        {board.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Board is empty. It fills automatically once the feed cron is scheduled and a contest is open.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 text-left border-b border-gray-800">
                <th className="py-2 pr-3 font-medium">Token</th>
                <th className="py-2 pr-3 font-medium">Launched</th>
                <th className="py-2 pr-3 font-medium text-right">Mcap @ add</th>
                <th className="py-2 pr-3 font-medium text-right">Live mcap</th>
                <th className="py-2 pr-3 font-medium text-right">Live liq</th>
                <th className="py-2 pr-3 font-medium text-right">Seen</th>
                <th className="py-2 font-medium text-right">Status</th>
              </tr></thead>
              <tbody>
                {board.map((b) => {
                  const over = focus ? b.last_mcap >= Number(focus.call_ceiling_mcap) : false
                  return (
                    <tr key={b.token_mint} className={`border-b border-gray-800/50 ${over ? "opacity-40" : ""}`}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {b.logo ? <img src={b.logo} alt="" className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-gray-800" />}
                          <div><span className="text-white font-medium">{b.symbol || "?"}</span> <span className="text-gray-500">{(b.name || "").slice(0, 24)}</span>
                            <div className="text-gray-600 font-mono text-[10px]">{b.token_mint.slice(0, 6)}…{b.token_mint.slice(-4)}</div></div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-gray-400">{ago(b.launch_ts)} ago</td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-300">{fmtUsd(b.mcap_at_add)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-white">{fmtUsd(b.last_mcap)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-300">{fmtUsd(b.last_liquidity)}</td>
                      <td className="py-2 pr-3 text-right text-gray-500">{ago(b.last_seen_at)}</td>
                      <td className="py-2 text-right">{over ? <span className="text-gray-500">over ceiling</span> : <span className="text-primary">callable</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
