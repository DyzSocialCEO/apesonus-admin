"use client"

/**
 * /dashboard/golden — Golden Ticket Desk.
 *
 * Seed reward pools with hard ceilings, watch them distribute, and run the
 * manual payout batch for real-value wins. The "before you launch" readout
 * shows expected reward rate and payout per 1000 plays plus max exposure, so
 * you can see farm-safety at a glance before hitting go. Spins pools are
 * capped per reward; real-value pools are bounded by tickets x max value.
 */

import { useEffect, useMemo, useState } from "react"
import { Ticket, Loader2, Plus, Check, X, Send, AlertTriangle } from "lucide-react"

type Pool = {
  id: number; reward_currency: string; token_mint: string | null; sponsor: string | null
  total_tickets: number; tickets_remaining: number; value_min: number; value_max: number
  total_pool_value: number; value_spent: number; max_reward_spins: number
  hit_probability: number; track_scope: number[] | null; status: string; created_at: string
}
type Claim = {
  id: number; wallet: string | null; currency: string; token_mint: string | null
  value: number; track_title: string | null; won_at: string; needs_wallet: boolean
}

const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const fmtV = (n: number) => (Number.isInteger(n) ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString("en-US"))
const curLabel = (c: string) => (c === "usdc" ? "USDC" : c === "spins" ? "SPINS" : "TOKEN")

export default function GoldenDeskPage() {
  const [pools, setPools] = useState<Pool[]>([])
  const [queue, setQueue] = useState<any>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  // form
  const [currency, setCurrency] = useState<"usdc" | "token" | "spins">("usdc")
  const [sponsor, setSponsor] = useState("")
  const [mint, setMint] = useState("")
  const [tickets, setTickets] = useState("40")
  const [vmin, setVmin] = useState("5")
  const [vmax, setVmax] = useState("5")
  const [poolValue, setPoolValue] = useState("200")
  const [maxSpins, setMaxSpins] = useState("300")
  const [prob, setProb] = useState("1.5") // percent in the UI
  const [scope, setScope] = useState("")
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState("")

  // payout
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [tx, setTx] = useState("")
  const [paying, setPaying] = useState(false)

  const load = () => {
    setLoading(true); setErr("")
    Promise.all([
      fetch("/api/admin/golden", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/golden/claims?status=pending_payout", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([o, c]) => {
      if (o.error) { setErr(o.error); return }
      setPools(o.pools || []); setQueue(o.queue || null)
      setClaims(c.claims || [])
    }).catch(() => setErr("Could not reach the server")).finally(() => setLoading(false))
  }
  useEffect(load, [])

  // Farm-safety readout, computed live from the form.
  const readout = useMemo(() => {
    const p = Number(prob) / 100
    const n = Number(tickets)
    const mn = Number(vmin), mx = Number(vmax)
    const cap = Number(poolValue)
    if (![p, n, mn, mx, cap].every((x) => Number.isFinite(x)) || p <= 0) return null
    const avg = (mn + mx) / 2
    const rewardsPer1k = p * 1000
    const payoutPer1k = rewardsPer1k * avg
    const playsToExhaust = p > 0 ? Math.round(n / p) : 0
    const exposure = Math.min(n * mx, cap)
    return { rewardsPer1k, payoutPer1k, playsToExhaust, exposure, avg }
  }, [prob, tickets, vmin, vmax, poolValue])

  const create = async () => {
    setSaving(true); setFormErr("")
    try {
      const res = await fetch("/api/admin/golden/pool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reward_currency: currency,
          token_mint: currency === "token" ? mint : undefined,
          sponsor_name: sponsor,
          total_tickets: Number(tickets),
          value_min: Number(vmin),
          value_max: Number(vmax),
          total_pool_value: Number(poolValue),
          max_reward_spins: currency === "spins" ? Number(maxSpins) : 0,
          hit_probability: Number(prob) / 100,
          track_scope: scope.trim() ? scope.split(",").map((s) => Number(s.trim())).filter(Boolean) : undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setFormErr(j.error || "Could not create pool"); return }
      setSponsor(""); setScope(""); load()
    } catch { setFormErr("Could not create pool") }
    finally { setSaving(false) }
  }

  const setStatus = async (pool_id: number, status: string) => {
    await fetch("/api/admin/golden/pool", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool_id, status }),
    })
    load()
  }

  const markPaid = async () => {
    if (sel.size === 0 || !tx.trim()) return
    setPaying(true)
    try {
      const res = await fetch("/api/admin/golden/claims", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(sel), tx_signature: tx.trim() }),
      })
      const j = await res.json()
      if (res.ok) { setSel(new Set()); setTx(""); load() }
      else setErr(j.error || "Could not mark paid")
    } finally { setPaying(false) }
  }

  const toggle = (id: number) => {
    const next = new Set(sel)
    next.has(id) ? next.delete(id) : next.add(id)
    setSel(next)
  }
  const selectableClaims = claims.filter((c) => !c.needs_wallet)
  const selTotalByCur = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of claims) if (sel.has(c.id)) t[c.currency] = (t[c.currency] || 0) + c.value
    return t
  }, [sel, claims])

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1.5"

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Ticket className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-white">Golden Ticket Desk</h1>
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── New pool ── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Plus className="w-4 h-4 text-primary" /> New reward pool</div>

          <div className="mb-4">
            <label className={label}>Reward currency</label>
            <div className="flex gap-1.5 bg-gray-950 border border-gray-800 rounded-lg p-1">
              {(["usdc", "token", "spins"] as const).map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`flex-1 text-xs py-2 rounded-md font-semibold transition-colors ${currency === c ? "bg-primary text-gray-950" : "text-gray-400 hover:text-white"}`}>
                  {c === "usdc" ? "USDC" : c === "token" ? "Sponsor token" : "Spins"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Sponsor name</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="BONK" /></div>
            {currency === "token"
              ? <div><label className={label}>Token mint</label><input className={input} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="mint address" /></div>
              : <div><label className={label}>Rewards in pool</label><input className={input} value={tickets} onChange={(e) => setTickets(e.target.value)} inputMode="numeric" /></div>}
            {currency === "token" && <div><label className={label}>Rewards in pool</label><input className={input} value={tickets} onChange={(e) => setTickets(e.target.value)} inputMode="numeric" /></div>}
            <div><label className={label}>Value per reward · min</label><input className={input} value={vmin} onChange={(e) => setVmin(e.target.value)} inputMode="decimal" /></div>
            <div><label className={label}>Value per reward · max</label><input className={input} value={vmax} onChange={(e) => setVmax(e.target.value)} inputMode="decimal" /></div>
            <div><label className={label}>Total pool value (ceiling)</label><input className={input} value={poolValue} onChange={(e) => setPoolValue(e.target.value)} inputMode="decimal" /></div>
            <div><label className={label}>Unlock chance / paid play (%)</label><input className={input} value={prob} onChange={(e) => setProb(e.target.value)} inputMode="decimal" /></div>
            {currency === "spins" && (
              <div className="col-span-2">
                <label className="block text-xs text-primary mb-1.5">Max Spins per reward · hard ceiling</label>
                <input className="w-full bg-primary/5 border border-primary/40 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none" value={maxSpins} onChange={(e) => setMaxSpins(e.target.value)} inputMode="numeric" />
              </div>
            )}
            <div className="col-span-2"><label className={label}>Track scope — track ids, comma-separated (blank = whole catalog)</label><input className={input} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. 12, 15, 18" /></div>
          </div>

          {/* Farm-safety readout */}
          {readout && (
            <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
              <div className="text-[11px] uppercase tracking-wider text-primary mb-2">Before you launch</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-gray-400">Rewards / 1000 plays</span><span className="text-white text-right font-mono">{readout.rewardsPer1k.toFixed(1)}</span>
                <span className="text-gray-400">Payout / 1000 plays</span><span className="text-white text-right font-mono">{fmtV(readout.payoutPer1k)} {curLabel(currency)}</span>
                <span className="text-gray-400">Pool lasts ~</span><span className="text-white text-right font-mono">{fmt(readout.playsToExhaust)} plays</span>
                <span className="text-gray-400">Max exposure</span><span className="text-primary text-right font-mono font-bold">{fmtV(readout.exposure)} {curLabel(currency)}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                If payout / 1000 plays is small next to what a farm spends to make 1000 plays, it is not worth farming. Max exposure caps your total spend no matter how many plays hit.
              </p>
            </div>
          )}

          {formErr && <div className="mt-3 text-sm text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {formErr}</div>}
          <button onClick={create} disabled={saving}
            className="mt-4 w-full bg-primary text-gray-950 font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Seed pool
          </button>
        </div>

        {/* ── Payout queue ── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white font-semibold"><Send className="w-4 h-4 text-primary" /> Payout queue</div>
            <div className="text-xs text-gray-500">
              {queue?.paid_count || 0} paid · {queue?.credited_count || 0} Spins credited
            </div>
          </div>

          {claims.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No real-value rewards waiting. Spins rewards are credited automatically.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setSel(new Set(selectableClaims.map((c) => c.id)))} className="text-xs text-primary hover:underline">Select all payable ({selectableClaims.length})</button>
                <button onClick={() => setSel(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {claims.map((c) => (
                  <div key={c.id} onClick={() => !c.needs_wallet && toggle(c.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${c.needs_wallet ? "border-gray-800 opacity-50" : sel.has(c.id) ? "border-primary bg-primary/5 cursor-pointer" : "border-gray-800 hover:border-gray-700 cursor-pointer"}`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${sel.has(c.id) ? "bg-primary" : "border border-gray-700"}`}>
                      {sel.has(c.id) && <Check className="w-3 h-3 text-gray-950" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-mono">{fmtV(c.value)} {curLabel(c.currency)}</div>
                      <div className="text-[11px] text-gray-500 truncate font-mono">
                        {c.needs_wallet ? "no wallet on file — user must connect" : c.wallet}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-600 shrink-0">{c.track_title || ""}</div>
                  </div>
                ))}
              </div>

              {sel.size > 0 && (
                <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <div className="text-xs text-gray-400 mb-2">
                    Sending {sel.size}: {Object.entries(selTotalByCur).map(([c, v]) => `${fmtV(v)} ${curLabel(c)}`).join(" · ")}
                  </div>
                  <input className={input + " mb-2"} value={tx} onChange={(e) => setTx(e.target.value)} placeholder="paste tx signature after sending" />
                  <button onClick={markPaid} disabled={paying || !tx.trim()}
                    className="w-full bg-primary text-gray-950 font-semibold text-sm py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                    {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark {sel.size} paid
                  </button>
                  <p className="text-[11px] text-gray-600 mt-2">You send from your wallet, then record the signature here. Auto-send comes after the audit.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Pools ── */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Pools</div>
        {pools.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No pools yet. Seed one above.</p>
        ) : (
          <div className="space-y-2">
            {pools.map((p) => {
              const pct = p.total_tickets > 0 ? Math.round(((p.total_tickets - p.tickets_remaining) / p.total_tickets) * 100) : 0
              return (
                <div key={p.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{curLabel(p.reward_currency)}</span>
                      {p.sponsor && <span className="text-xs text-gray-500">· {p.sponsor}</span>}
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${p.status === "live" ? "bg-primary/15 text-primary" : p.status === "exhausted" ? "bg-gray-700/40 text-gray-400" : "bg-gray-800 text-gray-500"}`}>{p.status}</span>
                      {p.track_scope && <span className="text-[10px] text-gray-600">scoped: {p.track_scope.length} tracks</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.status === "live" && <button onClick={() => setStatus(p.id, "ended")} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1"><X className="w-3 h-3" /> End</button>}
                      {p.status === "paused" && <button onClick={() => setStatus(p.id, "live")} className="text-xs text-primary hover:underline">Resume</button>}
                      {p.status === "live" && <button onClick={() => setStatus(p.id, "paused")} className="text-xs text-gray-500 hover:text-white">Pause</button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                    <div><div className="text-[11px] text-gray-500">Rewards left</div><div className="text-white font-mono">{fmt(p.tickets_remaining)} / {fmt(p.total_tickets)}</div></div>
                    <div><div className="text-[11px] text-gray-500">Value / reward</div><div className="text-white font-mono">{p.value_min === p.value_max ? fmtV(p.value_min) : `${fmtV(p.value_min)}–${fmtV(p.value_max)}`}</div></div>
                    <div><div className="text-[11px] text-gray-500">Spent / cap</div><div className="text-white font-mono">{fmtV(p.value_spent)} / {fmtV(p.total_pool_value)}</div></div>
                    <div><div className="text-[11px] text-gray-500">Unlock chance</div><div className="text-white font-mono">{(p.hit_probability * 100).toFixed(2)}%</div></div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
