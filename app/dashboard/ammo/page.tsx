"use client"

import { useEffect, useState, useCallback } from "react"
import { Fuel, Gift, Flame, ShoppingCart, Users2, Star, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Save, Check, TrendingUp, Search } from "lucide-react"

type Stats = {
  outstanding: number
  holders: number
  ammoSold: number
  usdGross: number
  ammoGranted: number
  ammoSpent: number
  freeServed: number
}

type Holder = {
  user_id: string
  balance: number
  display_name: string | null
  email: string | null
  wallet_address: string | null
}

type GrantRow = { id: number; user_id: string; amount: number; reason: string | null; actor: string | null; created_at: string }
type PurchaseRow = { id: number; user_id: string; ammo_amount: number; usd_cents: number; rail: string; status: string; created_at: string }
// ammo null = "use the discount ladder"; a filled ammo overrides the ladder.
// price_usd / ammo are null while a field is blank in the editor.
type Move = { ts: string; delta: number; reason: string; ref_table: string | null; ref_id: string | null }
type Ledger = {
  user: { id: string; email: string | null; display_name: string | null; wallet_address: string | null }
  inSpins: number
  outSpins: number
  balance: number
  drift: number
  movements: Move[]
}
type Pack = { id: string; price_usd: number | null; ammo: number | null; active: boolean; label?: string }
type Tier = { id: string; min_usd: number | null; bonus_pct: number | null }

const fmt = (n: number) => (n ?? 0).toLocaleString()
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function AmmoPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [holders, setHolders] = useState<Holder[]>([])
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(true)

  // one patient's ledger
  const [ledgerQuery, setLedgerQuery] = useState("")
  const [ledgerReason, setLedgerReason] = useState("")
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState("")

  const lookUp = useCallback(async (q: string, reason: string) => {
    if (!q.trim()) return
    setLedgerLoading(true)
    setLedgerError("")
    try {
      const params = new URLSearchParams({ q: q.trim() })
      if (reason) params.set("reason", reason)
      const r = await fetch(`/api/admin/ammo/ledger?${params.toString()}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) {
        setLedger(null)
        setLedgerError(String(d?.error || "That did not read."))
        return
      }
      setLedger(d as Ledger)
    } catch {
      setLedger(null)
      setLedgerError("That did not read.")
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  // grant form
  const [identifier, setIdentifier] = useState("")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [granting, setGranting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // daily track
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // packs + money split + discount ladder (saved together)
  const [packs, setPacks] = useState<Pack[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [treasuryPct, setTreasuryPct] = useState<number>(70)
  const [spinsPerPlay, setSpinsPerPlay] = useState<number>(1)
  const [savingCfg, setSavingCfg] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [packErrs, setPackErrs] = useState<Record<string, string>>({})
  const [tierErrs, setTierErrs] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    // Each endpoint is loaded independently and defensively. This page once
    // showed zeros forever because a single dead fetch (the removed
    // daily-track route) blew up a shared Promise.all before ANY state was
    // set, discarding perfectly good data from the working endpoints. One
    // endpoint failing must never blank the others again.
    const grab = async (url: string) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${url} -> ${r.status}`)
      return r.json()
    }
    const problems: string[] = []
    try {
      const a = await grab("/api/admin/ammo")
      setStats(a.stats || null)
      setHolders(a.topHolders || [])
      setGrants(a.recentGrants || [])
      setPurchases(a.recentPurchases || [])
      if (Array.isArray(a.errors) && a.errors.length) problems.push(...a.errors)
    } catch (e) {
      problems.push(e instanceof Error ? e.message : "stats failed")
    }
    try {
      const c = await grab("/api/admin/ammo/config")
      setPacks(Array.isArray(c.packs) ? c.packs.map((p: any) => ({ ...p, id: p.id || rid("pack") })) : [])
      setTiers(Array.isArray(c.discountTiers) ? c.discountTiers.map((t: any) => ({ ...t, id: rid("tier") })) : [])
      setTreasuryPct(Number.isFinite(c.treasuryPct) ? c.treasuryPct : 70)
      setSpinsPerPlay(Number.isInteger(c.spinsPerPlay) && c.spinsPerPlay >= 1 ? c.spinsPerPlay : 1)
    } catch (e) {
      problems.push(e instanceof Error ? e.message : "config failed")
    }
    setLoadErr(problems.length ? problems.join(" · ") : null)
    setLoading(false)
  }, [])

  const [clearingPending, setClearingPending] = useState(false)
  const clearStalePending = useCallback(async () => {
    if (!confirm("Clear all pending orders past their pay window? They're removed across all users. A late payment of an exact amount still credits.")) return
    setClearingPending(true)
    try {
      const res = await fetch("/api/admin/ammo/clear-pending", { method: "POST" })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: `Cleared ${d.cleared ?? 0} stale pending order${d.cleared === 1 ? "" : "s"}.` })
        load()
      } else {
        setMsg({ ok: false, text: d.error || "Could not clear pending." })
      }
    } catch {
      setMsg({ ok: false, text: "Network error." })
    } finally {
      setClearingPending(false)
    }
  }, [load])

  useEffect(() => { load() }, [load])

  const submitGrant = async () => {
    setMsg(null)
    const isEmail = identifier.includes("@")
    const body: any = { amount, reason }
    if (isEmail) body.email = identifier.trim()
    else body.userId = identifier.trim()

    setGranting(true)
    try {
      const res = await fetch("/api/admin/ammo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "Grant failed" })
      } else {
        setMsg({ ok: true, text: `Granted ${fmt(data.amountGranted)} Spins. New balance ${fmt(data.newBalance)}.` })
        setIdentifier(""); setAmount(""); setReason("")
        load()
      }
    } catch {
      setMsg({ ok: false, text: "Network error" })
    } finally {
      setGranting(false)
    }
  }

  const addPack = () =>
    setPacks(p => [...p, { id: rid("pack"), price_usd: 1, ammo: 200, active: true }])
  const updatePack = (id: string, patch: Partial<Pack>) =>
    setPacks(p => p.map(x => (x.id === id ? { ...x, ...patch } : x)))
  const removePack = (id: string) => setPacks(p => p.filter(x => x.id !== id))

  const addTier = () => setTiers(t => [...t, { id: rid("tier"), min_usd: 5, bonus_pct: 10 }])
  const updateTier = (id: string, patch: Partial<Tier>) =>
    setTiers(t => t.map(x => (x.id === id ? { ...x, ...patch } : x)))
  const removeTier = (id: string) => setTiers(t => t.filter(x => x.id !== id))

  const isInt = (v: number | null) => v !== null && Number.isInteger(v)

  // Strip fully-empty rows, flag rows that have input but break the rules.
  // Mirrors the server gate so the user sees why before the round trip.
  const validateConfig = () => {
    const pErr: Record<string, string> = {}
    const tErr: Record<string, string> = {}

    const cleanPacks = packs
      .filter(p => !(p.price_usd === null && p.ammo === null))
      .filter(p => {
        if (!isInt(p.price_usd) || (p.price_usd as number) < 1) {
          pErr[p.id] = "Price must be a whole dollar, 1 or more."; return false
        }
        if (p.ammo !== null && (!isInt(p.ammo) || (p.ammo as number) < 1)) {
          pErr[p.id] = "Spins must be a whole number 1 or more, or blank to use the ladder."; return false
        }
        return true
      })
      .map(p => ({ id: p.id, price_usd: p.price_usd, ammo: p.ammo, active: p.active, label: p.label }))

    const seen = new Set<number>()
    const cleanTiers = tiers
      .filter(t => !(t.min_usd === null && t.bonus_pct === null))
      .filter(t => {
        if (!isInt(t.min_usd) || (t.min_usd as number) < 1) {
          tErr[t.id] = "Spend threshold must be a whole dollar, 1 or more."; return false
        }
        if (!isInt(t.bonus_pct) || (t.bonus_pct as number) < 1 || (t.bonus_pct as number) > 100) {
          tErr[t.id] = "Bonus must be a whole number between 1 and 100."; return false
        }
        if (seen.has(t.min_usd as number)) {
          tErr[t.id] = `Another tier already starts at $${t.min_usd}.`; return false
        }
        seen.add(t.min_usd as number)
        return true
      })
      .map(t => ({ min_usd: t.min_usd, bonus_pct: t.bonus_pct }))

    return { ok: Object.keys(pErr).length === 0 && Object.keys(tErr).length === 0, cleanPacks, cleanTiers, pErr, tErr }
  }

  const saveConfig = async () => {
    const v = validateConfig()
    setPackErrs(v.pErr); setTierErrs(v.tErr)
    if (!v.ok) { setCfgMsg({ ok: false, text: "Fix the highlighted rows, then save." }); return }

    setSavingCfg(true); setSavedFlash(false); setCfgMsg(null)
    try {
      const res = await fetch("/api/admin/ammo/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs: v.cleanPacks, discountTiers: v.cleanTiers, treasuryPct: Number(treasuryPct), spinsPerPlay: Number(spinsPerPlay) }),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = Array.isArray(data.details) && data.details.length ? ` ${data.details.join(" ")}` : ""
        setCfgMsg({ ok: false, text: `${data.error || "Couldn't save."}${detail}` })
        return
      }
      setPacks((data.packs || v.cleanPacks).map((p: any) => ({ ...p, id: p.id || rid("pack") })))
      setTiers((data.discountTiers || v.cleanTiers).map((t: any) => ({ ...t, id: rid("tier") })))
      setTreasuryPct(data.treasuryPct ?? treasuryPct)
      setSpinsPerPlay(data.spinsPerPlay ?? spinsPerPlay)
      setPackErrs({}); setTierErrs({}); setCfgMsg(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch {
      setCfgMsg({ ok: false, text: "Network error." })
    } finally {
      setSavingCfg(false)
    }
  }

  // Rate shown in the header — derived from the live $1 pack (or the cheapest
  // active pack), never hardcoded, so the label always matches what patients buy.
  const ratePack = packs.find((p) => p.active && p.price_usd === 1 && p.ammo)
    || packs.filter((p) => p.active && p.price_usd && p.ammo).sort((a, b) => (a.price_usd! - b.price_usd!))[0]
  const ammoPerUsd = ratePack && ratePack.price_usd ? Math.round((ratePack.ammo || 0) / ratePack.price_usd) : 100

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Fuel className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Spins</h1>
          <p className="text-sm text-gray-500">
            What patients buy to keep the music going. $1 = {ammoPerUsd.toLocaleString("en-US")} Spins,
            and {spinsPerPlay === 1 ? "1 Spin plays 1 song" : `${spinsPerPlay} Spins play 1 song`}. Every play costs, replays included.
          </p>
        </div>
      </div>

      {loadErr && (
        <div className="mb-4 text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">
          Some data failed to load: {loadErr}. Numbers below may be incomplete — fix the failing endpoint, then reload.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Fuel} label="Outstanding" value={fmt(stats?.outstanding || 0)} sub={`${fmt(stats?.holders || 0)} holders`} />
            <StatCard icon={ShoppingCart} label="Sold" value={fmt(stats?.ammoSold || 0)} sub={`$${fmt(stats?.usdGross || 0)} gross`} />
            <StatCard icon={Gift} label="Granted" value={fmt(stats?.ammoGranted || 0)} />
            <StatCard icon={Flame} label="Spent" value={fmt(stats?.ammoSpent || 0)} />
          </div>

          {/* Packs, money split, discount ladder — one Save */}
          <div className="space-y-6">
            <div>
              {/* Pack manager */}
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold text-white">Spin packs</h2>
                  </div>
                  <button onClick={addPack}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                    <Plus className="w-4 h-4" /> Add pack
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  What patients can buy. Price is whole dollars only. Set a pack&apos;s own Spins to fix exactly what it gives, or leave Spins blank to let the discount ladder set it. Inactive packs stay saved but hide from the app.
                </p>

                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1.2fr_auto_auto] gap-2 px-1 text-[10px] uppercase tracking-wider text-gray-600">
                    <span>Price $</span><span>Spins</span><span>Label (optional)</span><span>Live</span><span></span>
                  </div>
                  {packs.length === 0 && (
                    <div className="text-xs text-gray-500 py-3">No packs yet. Add one to start selling.</div>
                  )}
                  {packs.map(p => {
                    const err = packErrs[p.id]
                    const errRing = err ? "border-red-600/60" : "border-gray-700"
                    return (
                      <div key={p.id} className="space-y-1">
                        <div className="grid grid-cols-[1fr_1fr_1.2fr_auto_auto] gap-2 items-center">
                          <input type="number" step="1" min="1" value={p.price_usd ?? ""}
                            onChange={e => updatePack(p.id, { price_usd: e.target.value === "" ? null : Number(e.target.value) })}
                            className={`bg-gray-950 border ${errRing} rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary`} />
                          <input type="number" step="1" min="1" value={p.ammo ?? ""} placeholder="Ladder"
                            onChange={e => updatePack(p.id, { ammo: e.target.value === "" ? null : Number(e.target.value) })}
                            className={`bg-gray-950 border ${errRing} rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary`} />
                          <input type="text" value={p.label || ""} placeholder="Best value"
                            onChange={e => updatePack(p.id, { label: e.target.value })}
                            className="bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary" />
                          <button onClick={() => updatePack(p.id, { active: !p.active })}
                            className={`px-2.5 py-2 rounded-lg text-xs font-medium border ${p.active ? "border-emerald-600/50 text-emerald-400 bg-emerald-500/5" : "border-gray-700 text-gray-500"}`}>
                            {p.active ? "On" : "Off"}
                          </button>
                          <button onClick={() => removePack(p.id)} className="p-2 text-gray-500 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {err && (
                          <p className="flex items-center gap-1.5 text-[11px] text-red-400 px-1">
                            <AlertCircle className="w-3 h-3 shrink-0" /> {err}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Discount ladder */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-white">Discount ladder</h2>
                </div>
                <button onClick={addTier}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                  <Plus className="w-4 h-4" /> Add tier
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Bonus Spins by how much a patient spends in one go (spend $5 or more, get 10%, and so on). Whole numbers only. A pack with its own Spins takes the bonus on top of that figure.
              </p>

              <div className="space-y-2 max-w-xl">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[10px] uppercase tracking-wider text-gray-600">
                  <span>Spend $ (min)</span><span>Bonus %</span><span></span>
                </div>
                {tiers.length === 0 && (
                  <div className="text-xs text-gray-500 py-3">No tiers yet. Add one to give bonus Spins for bigger spends.</div>
                )}
                {tiers.map(t => {
                  const err = tierErrs[t.id]
                  const errRing = err ? "border-red-600/60" : "border-gray-700"
                  return (
                    <div key={t.id} className="space-y-1">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <input type="number" step="1" min="1" value={t.min_usd ?? ""}
                          onChange={e => updateTier(t.id, { min_usd: e.target.value === "" ? null : Number(e.target.value) })}
                          className={`bg-gray-950 border ${errRing} rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary`} />
                        <input type="number" step="1" min="1" max="100" value={t.bonus_pct ?? ""}
                          onChange={e => updateTier(t.id, { bonus_pct: e.target.value === "" ? null : Number(e.target.value) })}
                          className={`bg-gray-950 border ${errRing} rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary`} />
                        <button onClick={() => removeTier(t.id)} className="p-2 text-gray-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {err && (
                        <p className="flex items-center gap-1.5 text-[11px] text-red-400 px-1">
                          <AlertCircle className="w-3 h-3 shrink-0" /> {err}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Save bar — packs and ladder save together */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex items-center justify-between gap-4">
              <div className="min-h-[20px] text-xs">
                {cfgMsg && !cfgMsg.ok && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {cfgMsg.text}
                  </span>
                )}
                {savedFlash && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Packs, split and ladder saved.
                  </span>
                )}
              </div>
              <button onClick={saveConfig} disabled={savingCfg}
                className={`flex items-center justify-center gap-2 font-semibold rounded-lg px-5 py-2.5 text-sm disabled:opacity-50 transition-colors ${savedFlash ? "bg-emerald-500 text-black" : "bg-primary text-black hover:bg-primary/90"}`}>
                {savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : savedFlash ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {savedFlash ? "Saved" : "Save packs & ladder"}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* What a song costs */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">What a song costs</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Spins taken from the balance for one completed play. There is no free allowance:
                with nothing in the balance the next play is refused and the app shows the buy
                screen. Replays cost again, which is what makes a big number on the chart mean
                somebody paid for it.
              </p>
              <div className="flex items-center gap-2">
                <input type="number" step="1" min="1" max="100" value={spinsPerPlay}
                  onChange={e => setSpinsPerPlay(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))}
                  className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary" />
                <span className="text-xs text-gray-500">Spins per play. Saved with the button below.</span>
              </div>
            </div>

            {/* Grant form */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">Grant Spins</h2>
              </div>
              <p className="text-xs text-amber-500/80 mb-4">
                Granted Spins are non-refundable and non-transferable. A grant is permanent free credit, so log a clear reason.
              </p>
              <div className="space-y-3">
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="User ID (UUID) or email"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary"
                />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount (max 1,000,000)"
                  inputMode="numeric"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary"
                />
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (devnet test, support comp, …)"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary"
                />
                <button
                  onClick={submitGrant}
                  disabled={granting || !identifier || !amount || !reason}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-black font-semibold rounded-lg px-4 py-2 text-sm disabled:opacity-40 transition-opacity"
                >
                  {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                  Grant
                </button>
                {msg && (
                  <div className={`flex items-center gap-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {msg.text}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top holders */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
              <Users2 className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-white">Top holders</h2>
            </div>
            {holders.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No balances yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-6 py-3 font-medium">User</th>
                      <th className="text-left px-6 py-3 font-medium">ID</th>
                      <th className="text-right px-6 py-3 font-medium">Spins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map(h => (
                      <tr key={h.user_id} className="border-b border-gray-800/60">
                        <td className="px-6 py-3 text-white">{h.display_name || h.email || "—"}</td>
                        <td className="px-6 py-3 text-gray-600 font-mono text-xs">{h.user_id.slice(0, 8)}…</td>
                        <td className="px-6 py-3 text-right text-white">{fmt(h.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* One patient's ledger. The same rows the patient sees on the Till. */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
              <Search className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-white">Where a patient&rsquo;s Spins went</h2>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-500">
                Email, wallet, name or user id. This reads the same ledger the patient reads on the
                Till, so you are both looking at one set of rows.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={ledgerQuery}
                  onChange={e => setLedgerQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") lookUp(ledgerQuery, ledgerReason) }}
                  placeholder="patient@email.com"
                  className="flex-1 min-w-[220px] rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white"
                />
                <select
                  value={ledgerReason}
                  onChange={e => { setLedgerReason(e.target.value); if (ledger) lookUp(ledgerQuery, e.target.value) }}
                  className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Everything</option>
                  <option value="purchase">Bought</option>
                  <option value="play">Plays</option>
                  <option value="call_entry">Call entries</option>
                </select>
                <button
                  onClick={() => lookUp(ledgerQuery, ledgerReason)}
                  disabled={ledgerLoading || !ledgerQuery.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {ledgerLoading ? "Reading" : "Read the ledger"}
                </button>
              </div>

              {ledgerError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  {ledgerError}
                </div>
              )}

              {ledger && (
                <div className="mt-4">
                  <div className="text-sm text-white">
                    {ledger.user.display_name || ledger.user.email || ledger.user.id}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Came in</div>
                      <div className="text-xl font-bold text-white">{fmt(ledger.inSpins)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Went out</div>
                      <div className="text-xl font-bold text-white">{fmt(ledger.outSpins)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Balance</div>
                      <div className="text-xl font-bold text-white">{fmt(ledger.balance)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Drift</div>
                      <div className={`text-xl font-bold ${ledger.drift === 0 ? "text-white" : "text-red-400"}`}>
                        {fmt(ledger.drift)}
                      </div>
                    </div>
                  </div>
                  {ledger.drift !== 0 && (
                    <div className="mt-2 text-sm text-red-400">
                      In minus out does not match the balance. Something moved a balance without
                      writing a row.
                    </div>
                  )}
                </div>
              )}
            </div>

            {ledger && (
              ledger.movements.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">Nothing under that filter.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs uppercase">
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-6 py-3 font-medium">When</th>
                        <th className="text-left px-6 py-3 font-medium">Reason</th>
                        <th className="text-left px-6 py-3 font-medium">Row</th>
                        <th className="text-right px-6 py-3 font-medium">Spins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.movements.map((m, i) => (
                        <tr key={i} className="border-b border-gray-800/60">
                          <td className="px-6 py-3 text-gray-400">{new Date(m.ts).toLocaleString()}</td>
                          <td className="px-6 py-3 text-white">{m.reason}</td>
                          <td className="px-6 py-3 text-gray-600 font-mono text-xs">
                            {m.ref_table || ""}{m.ref_id ? ` ${m.ref_id.slice(0, 12)}` : ""}
                          </td>
                          <td className={`px-6 py-3 text-right font-semibold ${m.delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {m.delta >= 0 ? "+" : ""}{fmt(m.delta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Recent grants */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
              <Gift className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-white">Recent grants</h2>
            </div>
            {grants.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No grants yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-6 py-3 font-medium">When</th>
                      <th className="text-left px-6 py-3 font-medium">User</th>
                      <th className="text-right px-6 py-3 font-medium">Amount</th>
                      <th className="text-left px-6 py-3 font-medium">Reason</th>
                      <th className="text-left px-6 py-3 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map(g => (
                      <tr key={g.id} className="border-b border-gray-800/60">
                        <td className="px-6 py-3 text-gray-400">{new Date(g.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3 text-gray-600 font-mono text-xs">{g.user_id.slice(0, 8)}…</td>
                        <td className="px-6 py-3 text-right text-white">{fmt(g.amount)}</td>
                        <td className="px-6 py-3 text-gray-400">{g.reason || "—"}</td>
                        <td className="px-6 py-3 text-gray-500">{g.actor || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent purchases (populated once the on-chain rail ships in 1B) */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">Recent purchases</h2>
              </div>
              <button
                onClick={clearStalePending}
                disabled={clearingPending}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-gray-500 hover:text-white transition-colors disabled:opacity-50"
              >
                {clearingPending ? "Clearing…" : "Clear stale pending"}
              </button>
            </div>
            {purchases.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No purchases yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-6 py-3 font-medium">When</th>
                      <th className="text-left px-6 py-3 font-medium">User</th>
                      <th className="text-right px-6 py-3 font-medium">Spins</th>
                      <th className="text-right px-6 py-3 font-medium">USD</th>
                      <th className="text-left px-6 py-3 font-medium">Rail</th>
                      <th className="text-left px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map(p => (
                      <tr key={p.id} className="border-b border-gray-800/60">
                        <td className="px-6 py-3 text-gray-400">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3 text-gray-600 font-mono text-xs">{p.user_id.slice(0, 8)}…</td>
                        <td className="px-6 py-3 text-right text-white">{fmt(p.ammo_amount)}</td>
                        <td className="px-6 py-3 text-right text-gray-400">${fmt(p.usd_cents / 100)}</td>
                        <td className="px-6 py-3 text-gray-400 uppercase">{p.rail}</td>
                        <td className="px-6 py-3 text-gray-400">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
