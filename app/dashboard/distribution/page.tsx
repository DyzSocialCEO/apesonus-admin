"use client"

/**
 * /dashboard/distribution — clean profit split.
 *
 * Set the three pools (Operational / Team / Development), add partners with a
 * SOL address + a % of the Team pool and lock them in (the unallocated
 * remainder is you). Every confirmed purchase auto-splits and freezes each
 * locked partner's cut — forward-only — so accrued/paid/owed is always live.
 * Pay partners in USDC manually here; auto mode lands later.
 */

import { useEffect, useState, useCallback } from "react"
import {
  Coins, DollarSign, Users2, Wrench, Code2, Lock, Unlock, Plus,
  Loader2, CheckCircle2, AlertCircle, Send, Trash2, Pencil, X, ShieldCheck,
} from "lucide-react"

const usd = (cents: number) => `$${((cents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a)

interface Partner {
  id: number; name: string; sol_address: string; share_pct: number
  is_locked: boolean; is_active: boolean
  accrued_cents: number; paid_cents: number; owed_cents: number
}
interface Payout { id: number; partner_id: number; amount_cents: number; tx_signature: string | null; method: string; status: string; note: string | null; created_at: string }
interface Overview {
  config: { ops_pct: number; team_pct: number; eco_pct: number; ops_wallet: string | null; eco_wallet: string | null; is_locked: boolean }
  gross_cents: number; ops_cents: number; team_cents: number; eco_cents: number
  allocated_pct: number; founder_pct: number
  partners: Partner[]; payouts: Payout[]
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide"><Icon className="w-4 h-4" /> {label}</div>
      <div className="mt-2 text-2xl font-bold" style={{ color: accent || "#fff" }}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function DistributionPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // config editor
  const [ops, setOps] = useState("30"); const [team, setTeam] = useState("40"); const [eco, setEco] = useState("30")
  const [opsW, setOpsW] = useState(""); const [ecoW, setEcoW] = useState("")

  // add-partner
  const [pName, setPName] = useState(""); const [pAddr, setPAddr] = useState(""); const [pShare, setPShare] = useState("")
  // pay
  const [payFor, setPayFor] = useState<number | null>(null); const [payAmt, setPayAmt] = useState(""); const [payTx, setPayTx] = useState(""); const [payNote, setPayNote] = useState("")
  // edit
  const [editFor, setEditFor] = useState<number | null>(null); const [eName, setEName] = useState(""); const [eAddr, setEAddr] = useState(""); const [eShare, setEShare] = useState("")

  const flash = (kind: "ok" | "err", text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000) }

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/distribution")
      if (!r.ok) { flash("err", "Failed to load distribution"); return }
      const d = (await r.json()) as Overview
      setData(d)
      setOps(String(d.config.ops_pct)); setTeam(String(d.config.team_pct)); setEco(String(d.config.eco_pct))
      setOpsW(d.config.ops_wallet || ""); setEcoW(d.config.eco_wallet || "")
    } catch { flash("err", "Failed to load distribution") }
  }, [])
  useEffect(() => { load() }, [load])

  const sum = Number(ops || 0) + Number(team || 0) + Number(eco || 0)
  const sumOk = Math.round(sum * 100) === 10000
  const locked = !!data?.config.is_locked

  const post = async (url: string, body: object) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || "Request failed")
    return j
  }

  const saveConfig = async (opts?: { is_locked?: boolean }) => {
    if (!sumOk && opts?.is_locked === undefined) { flash("err", "Pools must total 100%"); return }
    setBusy(true)
    try {
      await post("/api/admin/distribution/config", {
        ops_pct: Number(ops), team_pct: Number(team), eco_pct: Number(eco),
        ops_wallet: opsW, eco_wallet: ecoW, ...(opts || {}),
      })
      await load(); flash("ok", opts?.is_locked === true ? "Pools locked" : opts?.is_locked === false ? "Pools unlocked" : "Saved")
    } catch (e) { flash("err", e instanceof Error ? e.message : "Save failed") } finally { setBusy(false) }
  }

  const addPartner = async () => {
    setBusy(true)
    try {
      await post("/api/admin/distribution/partner", { name: pName, sol_address: pAddr, share_pct: Number(pShare) })
      setPName(""); setPAddr(""); setPShare(""); await load(); flash("ok", "Partner added — lock them to start accruing")
    } catch (e) { flash("err", e instanceof Error ? e.message : "Add failed") } finally { setBusy(false) }
  }

  const partnerAction = async (id: number, action: string, extra?: object) => {
    setBusy(true)
    try { await post(`/api/admin/distribution/partner/${id}`, { action, ...(extra || {}) }); await load(); if (action === "lock") flash("ok", "Locked in"); if (action === "remove") flash("ok", "Partner removed") }
    catch (e) { flash("err", e instanceof Error ? e.message : "Action failed") } finally { setBusy(false); setEditFor(null) }
  }

  const recordPayout = async (id: number) => {
    setBusy(true)
    try {
      await post("/api/admin/distribution/payout", { partner_id: id, amount_usd: Number(payAmt), tx_signature: payTx, note: payNote })
      setPayFor(null); setPayAmt(""); setPayTx(""); setPayNote(""); await load(); flash("ok", "Payout recorded")
    } catch (e) { flash("err", e instanceof Error ? e.message : "Payout failed") } finally { setBusy(false) }
  }

  if (!data) return <div className="p-8 flex items-center gap-3 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading distribution…</div>

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <Coins className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-white">Distribution</h1>
          <p className="text-sm text-gray-500">How every dollar is split, and what each partner is owed.</p>
        </div>
      </div>

      {msg && (
        <div className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {msg.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {msg.text}
        </div>
      )}

      {/* pool totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <StatCard icon={DollarSign} label="Gross revenue" value={usd(data.gross_cents)} sub="all confirmed purchases" accent="#c6ff2e" />
        <StatCard icon={Wrench} label={`Operational ${data.config.ops_pct}%`} value={usd(data.ops_cents)} />
        <StatCard icon={Users2} label={`Team ${data.config.team_pct}%`} value={usd(data.team_cents)} />
        <StatCard icon={Code2} label={`Development ${data.config.eco_pct}%`} value={usd(data.eco_cents)} />
      </div>

      {/* pool config */}
      <div className="mt-6 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-gray-400" /> Pools</h2>
          {locked
            ? <span className="flex items-center gap-1.5 text-xs text-amber-400"><Lock className="w-3.5 h-3.5" /> Locked</span>
            : <span className={`text-xs ${sumOk ? "text-green-400" : "text-red-400"}`}>Total: {sum}%</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[["Operational", ops, setOps], ["Team", team, setTeam], ["Development", eco, setEco]].map(([lab, val, set]: any) => (
            <label key={lab} className="block">
              <span className="text-xs text-gray-500 uppercase tracking-wide">{lab}</span>
              <div className="mt-1 flex items-center rounded-lg bg-gray-950 border border-gray-800 px-3">
                <input type="number" min={0} max={100} value={val} disabled={locked} onChange={(e) => set(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-white outline-none disabled:opacity-50" />
                <span className="text-gray-500">%</span>
              </div>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <label className="block"><span className="text-xs text-gray-500 uppercase tracking-wide">Operational wallet (SOL)</span>
            <input value={opsW} onChange={(e) => setOpsW(e.target.value)} placeholder="reserve address"
              className="mt-1 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2.5 text-white text-sm outline-none" /></label>
          <label className="block"><span className="text-xs text-gray-500 uppercase tracking-wide">Development wallet (SOL)</span>
            <input value={ecoW} onChange={(e) => setEcoW(e.target.value)} placeholder="development fund address"
              className="mt-1 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2.5 text-white text-sm outline-none" /></label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          {!locked && (
            <button onClick={() => saveConfig()} disabled={busy || !sumOk}
              className="flex items-center gap-2 rounded-lg bg-primary text-black font-medium px-4 py-2.5 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save pools
            </button>
          )}
          <button onClick={() => saveConfig({ is_locked: !locked })} disabled={busy || (!locked && !sumOk)}
            className="flex items-center gap-2 rounded-lg border border-gray-700 text-gray-200 px-4 py-2.5 text-sm hover:bg-gray-800">
            {locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />} {locked ? "Unlock" : "Lock pools"}
          </button>
        </div>
      </div>

      {/* partners */}
      <div className="mt-6 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-white flex items-center gap-2"><Users2 className="w-4 h-4 text-gray-400" /> Partners</h2>
          <div className="text-xs text-gray-400">
            Team pool <b className="text-white">{data.config.team_pct}%</b> · Allocated <b className="text-white">{data.allocated_pct}%</b> · Your remainder <b className="text-primary">{data.founder_pct}%</b>
          </div>
        </div>

        {/* add */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_auto_auto] gap-2 mt-4">
          <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Partner name"
            className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2.5 text-white text-sm outline-none" />
          <input value={pAddr} onChange={(e) => setPAddr(e.target.value)} placeholder="SOL address"
            className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2.5 text-white text-sm outline-none font-mono" />
          <div className="flex items-center rounded-lg bg-gray-950 border border-gray-800 px-3">
            <input type="number" min={0} max={100} value={pShare} onChange={(e) => setPShare(e.target.value)} placeholder="0"
              className="w-20 bg-transparent py-2.5 text-white text-sm outline-none" /><span className="text-gray-500 text-sm">% of team</span>
          </div>
          <button onClick={addPartner} disabled={busy || !pName || !pAddr || !pShare}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary text-black font-medium px-4 py-2.5 text-sm disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* list */}
        <div className="mt-4 space-y-2">
          {data.partners.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No partners yet. Add one above, set their share, then lock it in.</p>}
          {data.partners.map((p) => (
            <div key={p.id} className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{p.name}</span>
                    {p.is_locked
                      ? <span className="flex items-center gap-1 text-[10px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5"><Lock className="w-2.5 h-2.5" /> LOCKED</span>
                      : <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">DRAFT</span>}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{short(p.sol_address)} · {p.share_pct}% of team</div>
                </div>
                <div className="flex gap-4 text-right text-xs">
                  <div><div className="text-gray-500">Accrued</div><div className="text-white font-semibold">{usd(p.accrued_cents)}</div></div>
                  <div><div className="text-gray-500">Paid</div><div className="text-gray-300 font-semibold">{usd(p.paid_cents)}</div></div>
                  <div><div className="text-gray-500">Owed</div><div className="font-semibold" style={{ color: p.owed_cents > 0 ? "#c6ff2e" : "#9ca3af" }}>{usd(p.owed_cents)}</div></div>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.is_locked
                    ? <button onClick={() => partnerAction(p.id, "unlock")} title="Unlock" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800"><Unlock className="w-4 h-4" /></button>
                    : <>
                        <button onClick={() => partnerAction(p.id, "lock")} title="Lock in" className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"><Lock className="w-4 h-4" /></button>
                        <button onClick={() => { setEditFor(editFor === p.id ? null : p.id); setEName(p.name); setEAddr(p.sol_address); setEShare(String(p.share_pct)) }} title="Edit" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => partnerAction(p.id, "remove")} title="Remove" className="p-2 rounded-lg border border-gray-700 text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                      </>}
                  <button onClick={() => { setPayFor(payFor === p.id ? null : p.id); setPayAmt(((p.owed_cents) / 100).toFixed(2)); setPayTx(""); setPayNote("") }} disabled={p.owed_cents <= 0}
                    className="flex items-center gap-1.5 rounded-lg bg-primary text-black font-medium px-3 py-2 text-sm disabled:opacity-40"><Send className="w-3.5 h-3.5" /> Pay</button>
                </div>
              </div>

              {/* edit row */}
              {editFor === p.id && !p.is_locked && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_auto_auto] gap-2 mt-3 pt-3 border-t border-gray-800">
                  <input value={eName} onChange={(e) => setEName(e.target.value)} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-white text-sm outline-none" />
                  <input value={eAddr} onChange={(e) => setEAddr(e.target.value)} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-white text-sm outline-none font-mono" />
                  <div className="flex items-center rounded-lg bg-gray-900 border border-gray-800 px-3"><input type="number" value={eShare} onChange={(e) => setEShare(e.target.value)} className="w-20 bg-transparent py-2 text-white text-sm outline-none" /><span className="text-gray-500 text-sm">%</span></div>
                  <button onClick={() => partnerAction(p.id, "update", { name: eName, sol_address: eAddr, share_pct: Number(eShare) })} className="rounded-lg bg-gray-200 text-black font-medium px-4 py-2 text-sm">Save</button>
                </div>
              )}

              {/* pay row */}
              {payFor === p.id && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="grid grid-cols-1 lg:grid-cols-[auto_1.4fr_1fr_auto_auto] gap-2 items-center">
                    <div className="flex items-center rounded-lg bg-gray-900 border border-gray-800 px-3"><span className="text-gray-500 text-sm">$</span><input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className="w-24 bg-transparent py-2 text-white text-sm outline-none" /></div>
                    <input value={payTx} onChange={(e) => setPayTx(e.target.value)} placeholder="USDC tx signature (optional)" className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-white text-sm outline-none font-mono" />
                    <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="note (optional)" className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-white text-sm outline-none" />
                    <button onClick={() => recordPayout(p.id)} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary text-black font-medium px-4 py-2 text-sm disabled:opacity-50"><Send className="w-3.5 h-3.5" /> Record</button>
                    <button onClick={() => setPayFor(null)} className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800"><X className="w-4 h-4" /></button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Send the USDC to {short(p.sol_address)} from your treasury, then record it here. Caps at what's owed.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* proof note + recent payouts */}
      <div className="mt-6 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center gap-2 text-gray-300"><ShieldCheck className="w-4 h-4 text-primary" /> <span className="font-medium">Recent payouts</span></div>
        {data.payouts.length === 0
          ? <p className="text-sm text-gray-500 mt-3">No payouts yet.</p>
          : <div className="mt-3 space-y-1.5">
              {data.payouts.map((po) => {
                const who = data.partners.find((p) => p.id === po.partner_id)
                return (
                  <div key={po.id} className="flex items-center justify-between text-xs border-b border-gray-800/60 py-2">
                    <span className="text-gray-300">{who?.name || `#${po.partner_id}`} <span className="text-gray-600">· {new Date(po.created_at).toLocaleDateString()}</span></span>
                    <span className="flex items-center gap-3">
                      {po.tx_signature && <span className="text-gray-600 font-mono">{short(po.tx_signature)}</span>}
                      <span className="text-white font-semibold">{usd(po.amount_cents)}</span>
                    </span>
                  </div>
                )
              })}
            </div>}
      </div>
    </div>
  )
}
