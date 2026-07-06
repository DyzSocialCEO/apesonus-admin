"use client"

/**
 * /dashboard/golden — Golden Ticket Desk (raffle model).
 *
 * Launch time-boxed raffle campaigns: sponsor + link, a cash pool, editable
 * prize tiers, a Spins consolation pot, a duration, and an activation
 * threshold. Users earn entries by streaming; winners are drawn at the end
 * (weighted by entries), tiered cash + Spins to a wider active set. Below:
 * live/past campaigns with entry counts and Draw / End / Void controls, and
 * the manual payout queue for real-value wins.
 */

import { useEffect, useMemo, useState } from "react"
import { Ticket, Loader2, Plus, Trash2, Check, Send, AlertTriangle, Play, X } from "lucide-react"

type Tier = { rank_from: number; rank_to: number; pct: number }
type Campaign = {
  id: number; sponsor_name: string | null; sponsor_url: string | null
  reward_currency: string; token_mint: string | null
  total_pool_value: number; spins_pot: number; tiers: Tier[]
  activation_threshold: number; starts_at: string; ends_at: string
  status: string; settled_at: string | null; draw_summary: any
  entries: number; ready_to_draw: boolean
}
type Claim = { id: number; wallet: string | null; currency: string; value: number; track_title: string | null; needs_wallet: boolean }

const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const fmtV = (n: number) => (Number.isInteger(n) ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString("en-US"))
const curLabel = (c: string) => (c === "usdc" ? "USDC" : c === "spins" ? "SPINS" : "TOKEN")
const DEFAULT_TIERS: Tier[] = [
  { rank_from: 1, rank_to: 1, pct: 25 },
  { rank_from: 2, rank_to: 2, pct: 15 },
  { rank_from: 3, rank_to: 3, pct: 10 },
  { rank_from: 4, rank_to: 10, pct: 50 },
]

function countdown(ends: string): string {
  const ms = new Date(ends).getTime() - Date.now()
  if (ms <= 0) return "ended"
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export default function GoldenDeskPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [queue, setQueue] = useState<any>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [queueView, setQueueView] = useState<"pending_payout" | "paid">("pending_payout")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  // form
  const [currency, setCurrency] = useState<"usdc" | "token">("usdc")
  const [sponsor, setSponsor] = useState("")
  const [sponsorUrl, setSponsorUrl] = useState("")
  const [mint, setMint] = useState("")
  const [pool, setPool] = useState("10000")
  const [spinsPot, setSpinsPot] = useState("10000")
  const [durationH, setDurationH] = useState("72")
  const [threshold, setThreshold] = useState("50")
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS)
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
      fetch(`/api/admin/golden/claims?status=${queueView}`, { cache: "no-store" }).then((r) => r.json()),
    ]).then(([o, c]) => {
      if (o.error) { setErr(o.error); return }
      setCampaigns(o.campaigns || []); setQueue(o.queue || null); setClaims(c.claims || [])
    }).catch(() => setErr("Could not reach the server")).finally(() => setLoading(false))
  }
  useEffect(load, [queueView])

  const pctSum = useMemo(() => tiers.reduce((a, t) => a + (Number(t.pct) || 0), 0), [tiers])
  const winnerSlots = useMemo(() => tiers.reduce((m, t) => Math.max(m, Number(t.rank_to) || 0), 0), [tiers])
  const topPrize = useMemo(() => {
    let best = 0
    for (const t of tiers) {
      const places = Math.max(1, (Number(t.rank_to) || 1) - (Number(t.rank_from) || 1) + 1)
      const each = (Number(t.pct) || 0) / places
      if (each > best) best = each
    }
    return (best / 100) * (Number(pool) || 0)
  }, [tiers, pool])

  const setTier = (i: number, key: keyof Tier, v: string) => {
    setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: Number(v) || 0 } : t))
  }
  const addTier = () => setTiers((prev) => [...prev, { rank_from: winnerSlots + 1, rank_to: winnerSlots + 1, pct: 0 }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))

  const create = async () => {
    setSaving(true); setFormErr("")
    try {
      const res = await fetch("/api/admin/golden/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name: sponsor, sponsor_url: sponsorUrl,
          reward_currency: currency, token_mint: currency === "token" ? mint : undefined,
          total_pool_value: Number(pool), spins_pot: Number(spinsPot),
          duration_hours: Number(durationH), activation_threshold: Number(threshold), tiers,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setFormErr(j.error || "Could not launch"); return }
      setSponsor(""); setSponsorUrl(""); load()
    } catch { setFormErr("Could not launch") } finally { setSaving(false) }
  }

  const campaignAction = async (id: number, action: string) => {
    if (action === "delete" && !window.confirm("Delete this campaign, its entries, and its reward records? This cannot be undone.")) return
    const res = await fetch("/api/admin/golden/campaign", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) setErr(j.error || "Action failed")
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
      if (res.ok) { setSel(new Set()); setTx(""); load() }
    } finally { setPaying(false) }
  }
  const toggle = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  const payable = claims.filter((c) => !c.needs_wallet)

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1.5"

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6"><Ticket className="w-6 h-6 text-primary" /><h1 className="text-xl font-bold text-white">Golden Ticket Desk</h1></div>
      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* New campaign */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Plus className="w-4 h-4 text-primary" /> New campaign</div>

          <div className="mb-4">
            <label className={label}>Prize currency</label>
            <div className="flex gap-1.5 bg-gray-950 border border-gray-800 rounded-lg p-1">
              {(["usdc", "token"] as const).map((c) => (
                <button key={c} onClick={() => setCurrency(c)} className={`flex-1 text-xs py-2 rounded-md font-semibold ${currency === c ? "bg-primary text-gray-950" : "text-gray-400"}`}>
                  {c === "usdc" ? "USDC" : "Sponsor token"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Sponsor name</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="BONK" /></div>
            <div><label className={label}>Sponsor link (tappable in app)</label><input className={input} value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://..." /></div>
            {currency === "token" && <div className="col-span-2"><label className={label}>Token mint</label><input className={input} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="mint address" /></div>}
            <div><label className={label}>Cash pool ({curLabel(currency)})</label><input className={input} value={pool} onChange={(e) => setPool(e.target.value)} inputMode="decimal" /></div>
            <div><label className={label}>Spins consolation pot</label><input className={input} value={spinsPot} onChange={(e) => setSpinsPot(e.target.value)} inputMode="numeric" /></div>
            <div><label className={label}>Duration (hours)</label><input className={input} value={durationH} onChange={(e) => setDurationH(e.target.value)} inputMode="numeric" /></div>
            <div><label className={label}>Activation threshold (min entries)</label><input className={input} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" /></div>
          </div>

          {/* Tiers editor */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Prize tiers · % of pool</span>
              <span className={`text-xs font-mono ${Math.abs(pctSum - 100) < 0.01 ? "text-primary" : "text-red-400"}`}>sum {pctSum}% {Math.abs(pctSum - 100) < 0.01 ? "✓" : "(must be 100)"}</span>
            </div>
            <div className="space-y-1.5">
              {tiers.map((t, i) => {
                const places = Math.max(1, (t.rank_to || 1) - (t.rank_from || 1) + 1)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-10">rank</span>
                    <input className="w-14 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-white" value={t.rank_from} onChange={(e) => setTier(i, "rank_from", e.target.value)} inputMode="numeric" />
                    <span className="text-gray-600">–</span>
                    <input className="w-14 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-white" value={t.rank_to} onChange={(e) => setTier(i, "rank_to", e.target.value)} inputMode="numeric" />
                    <input className="w-16 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-white" value={t.pct} onChange={(e) => setTier(i, "pct", e.target.value)} inputMode="decimal" />
                    <span className="text-[10px] text-gray-600 flex-1">% {places > 1 ? `(${(t.pct / places).toFixed(1)}% each)` : ""}</span>
                    <button onClick={() => removeTier(i)} className="text-gray-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )
              })}
            </div>
            <button onClick={addTier} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add tier</button>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Winner slots</span><span className="text-white font-mono">{winnerSlots}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Top single prize</span><span className="text-primary font-mono font-bold">{fmtV(topPrize)} {curLabel(currency)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Max cash exposure</span><span className="text-white font-mono">{fmtV(Number(pool) || 0)} {curLabel(currency)}</span></div>
          </div>

          {formErr && <div className="mt-3 text-sm text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {formErr}</div>}
          <button onClick={create} disabled={saving || Math.abs(pctSum - 100) > 0.01}
            className="mt-4 w-full bg-primary text-gray-950 font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Launch campaign
          </button>
        </div>

        {/* Payout queue */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white font-semibold"><Send className="w-4 h-4 text-primary" /> Payout queue</div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded-lg p-0.5">
                {(["pending_payout", "paid"] as const).map((v) => (
                  <button key={v} onClick={() => setQueueView(v)}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-semibold ${queueView === v ? "bg-primary text-gray-950" : "text-gray-400"}`}>
                    {v === "pending_payout" ? "Pending" : "Paid"}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-500">{queue?.paid_count || 0} paid · {queue?.credited_count || 0} Spins credited</div>
            </div>
          </div>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{queueView === "paid" ? "Nothing paid yet." : "No real-value rewards waiting. Spins are credited automatically at the draw."}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setSel(new Set(payable.map((c) => c.id)))} className="text-xs text-primary hover:underline">Select all payable ({payable.length})</button>
                <button onClick={() => setSel(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {claims.map((c) => (
                  <div key={c.id} onClick={() => !c.needs_wallet && toggle(c.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${c.needs_wallet ? "border-gray-800 opacity-50" : sel.has(c.id) ? "border-primary bg-primary/5 cursor-pointer" : "border-gray-800 hover:border-gray-700 cursor-pointer"}`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${sel.has(c.id) ? "bg-primary" : "border border-gray-700"}`}>{sel.has(c.id) && <Check className="w-3 h-3 text-gray-950" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-mono">{fmtV(c.value)} {curLabel(c.currency)}</div>
                      <div className="text-[11px] text-gray-500 truncate font-mono">{c.needs_wallet ? "no wallet on file — user must request" : c.wallet}</div>
                    </div>
                  </div>
                ))}
              </div>
              {sel.size > 0 && (
                <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <input className={input + " mb-2"} value={tx} onChange={(e) => setTx(e.target.value)} placeholder="paste tx signature after sending" />
                  <button onClick={markPaid} disabled={paying || !tx.trim()} className="w-full bg-primary text-gray-950 font-semibold text-sm py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark {sel.size} paid
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Campaigns */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Campaigns</div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No campaigns yet. Launch one above.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{fmtV(c.total_pool_value)} {curLabel(c.reward_currency)}</span>
                    {c.sponsor_name && <span className="text-xs text-gray-500">· {c.sponsor_name}</span>}
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${c.status === "live" ? "bg-primary/15 text-primary" : c.status === "settled" ? "bg-gray-700/40 text-gray-300" : "bg-gray-800 text-gray-500"}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {c.status === "live" && <span className="text-gray-500">{countdown(c.ends_at)}</span>}
                    {c.ready_to_draw && <button onClick={() => campaignAction(c.id, "draw")} className="text-primary font-semibold hover:underline flex items-center gap-1"><Play className="w-3 h-3" /> Draw now</button>}
                    {c.status === "live" && !c.ready_to_draw && <button onClick={() => campaignAction(c.id, "end_now")} className="text-gray-400 hover:text-white">End now</button>}
                    {c.status === "live" && <button onClick={() => campaignAction(c.id, "void")} className="text-gray-500 hover:text-red-400 flex items-center gap-1"><X className="w-3 h-3" /> Void</button>}
                    <button onClick={() => campaignAction(c.id, "delete")} className="text-gray-600 hover:text-red-400 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <div><div className="text-[11px] text-gray-500">Entries</div><div className="text-white font-mono">{fmt(c.entries)}</div></div>
                  <div><div className="text-[11px] text-gray-500">Winner slots</div><div className="text-white font-mono">{(c.tiers || []).reduce((m, t) => Math.max(m, t.rank_to), 0)}</div></div>
                  <div><div className="text-[11px] text-gray-500">Threshold</div><div className="text-white font-mono">{fmt(c.activation_threshold)}</div></div>
                  <div><div className="text-[11px] text-gray-500">Spins pot</div><div className="text-white font-mono">{fmt(c.spins_pot)}</div></div>
                </div>
                {c.draw_summary && (
                  <div className="mt-2 text-[11px] text-gray-500 font-mono">
                    drawn: {c.draw_summary.cash_winners ?? 0} cash winners · {fmtV(c.draw_summary.paid_cash ?? 0)} {curLabel(c.reward_currency)} · {c.draw_summary.spins_recipients ?? 0} got Spins
                    {c.draw_summary.void ? " · VOID (under threshold)" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
