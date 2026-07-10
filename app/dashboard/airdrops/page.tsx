"use client"

/**
 * /dashboard/airdrops — partner token drops to Ember holders.
 *
 * Flow: create a draft (sponsor, token, mint, decimals, pool, dust floor) →
 * Compute (snapshots everyone's Embers, writes each holder's proportional
 * allocation) → players claim with a wallet on the app → Send (transfers the
 * token to every requested claim, one tx each, stamped on-chain).
 *
 * The pool is partner-funded; nothing here touches house money. Sends draw
 * from the payout wallet, which must hold the token being dropped.
 */

import { useEffect, useState } from "react"
import { Gift, Loader2, Calculator, Send } from "lucide-react"

type Drop = {
  id: number; sponsor: string; token_symbol: string; token_mint: string
  token_decimals: number; total_amount: number; dust_floor: number
  status: string; total_embers_snapshot: number | null; eligible_count: number | null
}

const n = (v: number) => (v || 0).toLocaleString("en-US")

export default function AirdropsPage() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [byDrop, setByDrop] = useState<Record<number, { requested: number; sent: number; total: number }>>({})
  const [busy, setBusy] = useState<string>("")
  const [msg, setMsg] = useState("")
  const [results, setResults] = useState<Record<number, any[]>>({})

  // create form
  const [sponsor, setSponsor] = useState("")
  const [sym, setSym] = useState("")
  const [mint, setMint] = useState("")
  const [dec, setDec] = useState("5")
  const [amount, setAmount] = useState("")
  const [dust, setDust] = useState("0")

  const load = () => fetch("/api/admin/airdrops").then((r) => r.json()).then((j) => {
    setDrops(j.drops || []); setByDrop(j.byDrop || {})
  }).catch(() => {})
  useEffect(() => { load() }, [])

  const create = async () => {
    setBusy("create"); setMsg("")
    const r = await fetch("/api/admin/airdrops", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", sponsor, token_symbol: sym, token_mint: mint, token_decimals: Number(dec), total_amount: Number(amount), dust_floor: Number(dust) }),
    })
    const j = await r.json(); setBusy("")
    if (r.ok) { setSponsor(""); setSym(""); setMint(""); setAmount(""); setDust("0"); setDec("5"); load() }
    else setMsg(j.error || "create failed")
  }

  const compute = async (id: number) => {
    setBusy("compute" + id); setMsg("")
    const r = await fetch("/api/admin/airdrops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "compute", airdrop: id }) })
    const j = await r.json(); setBusy("")
    if (!j.ok) setMsg(j.reason || j.error || "compute failed"); else setMsg(`Computed: ${j.eligible} eligible holders, ${n(j.total_embers)} total Embers.`)
    load()
  }

  const send = async (id: number) => {
    if (!window.confirm(`Send tokens to all claimed holders of drop #${id}? Real on-chain transfers from the payout wallet.`)) return
    setBusy("send" + id); setMsg("")
    const r = await fetch("/api/admin/airdrops/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ airdrop: id }) })
    const j = await r.json(); setBusy("")
    if (r.ok) { setResults((p) => ({ ...p, [id]: j.results || [] })); setMsg(`Sent ${j.sent}/${j.total}.`); setTimeout(load, 1500) }
    else setMsg(j.error || "send failed")
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1"

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Airdrops</h1>
        <p className="text-sm text-gray-400 mt-1">Partner tokens to Ember holders, split by Embers. Pool is partner-funded. Sends pull from the payout wallet, which must hold the token.</p>
      </div>

      {msg && <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-2 text-sm text-gray-300 font-mono">{msg}</div>}

      {/* Create */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="text-sm font-semibold text-white mb-3">New drop</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className={label}>Sponsor</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="BONK" /></div>
          <div><label className={label}>Token symbol</label><input className={input} value={sym} onChange={(e) => setSym(e.target.value)} placeholder="BONK" /></div>
          <div><label className={label}>Token mint</label><input className={input} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="mint address" /></div>
          <div><label className={label}>Decimals</label><input className={input} value={dec} onChange={(e) => setDec(e.target.value)} inputMode="numeric" /></div>
          <div><label className={label}>Total pool (tokens)</label><input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="10000000" /></div>
          <div><label className={label}>Dust floor (skip below)</label><input className={input} value={dust} onChange={(e) => setDust(e.target.value)} inputMode="numeric" placeholder="0" /></div>
        </div>
        <button onClick={create} disabled={busy === "create" || !sponsor || !mint || !(Number(amount) > 0)}
          className="mt-3 bg-primary text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
          {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Create draft
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {drops.length === 0 && <div className="text-sm text-gray-500">No drops yet.</div>}
        {drops.map((d) => {
          const g = byDrop[d.id] || { requested: 0, sent: 0, total: 0 }
          return (
            <div key={d.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-white font-semibold">#{d.id} · {d.sponsor} · {n(d.total_amount)} {d.token_symbol}</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{d.token_mint.slice(0, 10)}… · {d.token_decimals} dec · dust {n(d.dust_floor)} · <span className="uppercase text-gray-400">{d.status}</span></div>
                  {d.status !== "draft" && <div className="text-xs text-gray-400 mt-1">{n(d.eligible_count || 0)} eligible · {n(d.total_embers_snapshot || 0)} Embers snapshot · {g.requested} claimed, {g.sent} sent</div>}
                </div>
                <div className="flex gap-2">
                  {d.status === "draft" && (
                    <button onClick={() => compute(d.id)} disabled={busy === "compute" + d.id}
                      className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
                      {busy === "compute" + d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Compute
                    </button>
                  )}
                  {d.status !== "draft" && g.requested > 0 && (
                    <button onClick={() => send(d.id)} disabled={busy === "send" + d.id}
                      className="bg-primary text-gray-950 font-semibold text-sm px-3 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
                      {busy === "send" + d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send {g.requested}
                    </button>
                  )}
                </div>
              </div>
              {results[d.id] && (
                <div className="mt-3 space-y-1 text-[11px] font-mono">
                  {results[d.id].map((r) => (
                    <div key={r.id} className={r.ok ? "text-green-400" : "text-red-400"}>#{r.id} {r.ok ? `sent · ${r.signature?.slice(0, 10)}…` : `failed · ${r.error}`}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
