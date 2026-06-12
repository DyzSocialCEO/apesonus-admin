"use client"

import { useEffect, useState, useCallback } from "react"
import { Fuel, Gift, Flame, ShoppingCart, Users2, Star, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Percent, Save } from "lucide-react"

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
type TrackOpt = { id: number; title: string; artist: string }
type Pack = { id: string; price_usd: number; ammo: number; active: boolean; label?: string }

const fmt = (n: number) => (n ?? 0).toLocaleString()

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
  const [tracks, setTracks] = useState<TrackOpt[]>([])
  const [featuredId, setFeaturedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // grant form
  const [identifier, setIdentifier] = useState("")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [granting, setGranting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // daily track
  const [savingTrack, setSavingTrack] = useState(false)
  const [trackSaved, setTrackSaved] = useState(false)
  const [trackErr, setTrackErr] = useState(false)

  // packs + money split
  const [packs, setPacks] = useState<Pack[]>([])
  const [treasuryPct, setTreasuryPct] = useState<number>(70)
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, d, c] = await Promise.all([
        fetch("/api/admin/ammo").then(r => r.json()),
        fetch("/api/admin/ammo/daily-track").then(r => r.json()),
        fetch("/api/admin/ammo/config").then(r => r.json()),
      ])
      setStats(a.stats || null)
      setHolders(a.topHolders || [])
      setGrants(a.recentGrants || [])
      setPurchases(a.recentPurchases || [])
      setTracks(d.tracks || [])
      setFeaturedId(d.featuredId ?? null)
      setPacks(Array.isArray(c.packs) ? c.packs : [])
      setTreasuryPct(Number.isFinite(c.treasuryPct) ? c.treasuryPct : 70)
    } finally {
      setLoading(false)
    }
  }, [])

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
        setMsg({ ok: true, text: `Granted ${fmt(data.amountGranted)} Ammo. New balance ${fmt(data.newBalance)}.` })
        setIdentifier(""); setAmount(""); setReason("")
        load()
      }
    } catch {
      setMsg({ ok: false, text: "Network error" })
    } finally {
      setGranting(false)
    }
  }

  const saveTrack = async (val: string) => {
    setSavingTrack(true); setTrackSaved(false); setTrackErr(false)
    try {
      const trackId = val === "" ? null : Number(val)
      const res = await fetch("/api/admin/ammo/daily-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      })
      if (res.ok) {
        setFeaturedId(trackId)
        setTrackSaved(true)
        setTimeout(() => setTrackSaved(false), 4000)
      } else {
        setTrackErr(true)
      }
    } catch {
      setTrackErr(true)
    } finally {
      setSavingTrack(false)
    }
  }

  const addPack = () =>
    setPacks(p => [...p, { id: `pack_${Math.random().toString(36).slice(2, 8)}`, price_usd: 1, ammo: 200, active: true }])
  const updatePack = (id: string, patch: Partial<Pack>) =>
    setPacks(p => p.map(x => (x.id === id ? { ...x, ...patch } : x)))
  const removePack = (id: string) => setPacks(p => p.filter(x => x.id !== id))

  const saveConfig = async () => {
    setSavingCfg(true); setCfgMsg(null)
    try {
      const clean = packs
        .filter(p => Number(p.price_usd) > 0 && Number(p.ammo) > 0)
        .map(p => ({ ...p, price_usd: Number(p.price_usd), ammo: Math.round(Number(p.ammo)) }))
      const res = await fetch("/api/admin/ammo/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs: clean, treasuryPct: Number(treasuryPct) }),
      })
      const data = await res.json()
      if (!res.ok) { setCfgMsg({ ok: false, text: data.error || "Couldn't save." }); return }
      setPacks(data.packs || clean)
      setTreasuryPct(data.treasuryPct ?? treasuryPct)
      setCfgMsg({ ok: true, text: "Saved." })
      setTimeout(() => setCfgMsg(null), 3000)
    } catch {
      setCfgMsg({ ok: false, text: "Network error." })
    } finally {
      setSavingCfg(false)
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Fuel className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Ammo</h1>
          <p className="text-sm text-gray-500">THE FLOOR — consumable stream credit. $1 = 100 Ammo, 1 Ammo = 1 qualified stream.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Fuel} label="Outstanding" value={fmt(stats?.outstanding || 0)} sub={`${fmt(stats?.holders || 0)} holders`} />
            <StatCard icon={ShoppingCart} label="Sold" value={fmt(stats?.ammoSold || 0)} sub={`$${fmt(stats?.usdGross || 0)} gross`} />
            <StatCard icon={Gift} label="Granted" value={fmt(stats?.ammoGranted || 0)} />
            <StatCard icon={Flame} label="Spent" value={fmt(stats?.ammoSpent || 0)} sub={`${fmt(stats?.freeServed || 0)} free plays served`} />
          </div>

          {/* Packs + money split */}
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
            {/* Pack manager */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-white">Ammo packs</h2>
                </div>
                <button onClick={addPack}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                  <Plus className="w-4 h-4" /> Add pack
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                What players can buy. Set the price and the Ammo each pack gives. Nothing is hardcoded, these drive the buy screen. Inactive packs stay saved but hide from players.
              </p>

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1.2fr_auto_auto] gap-2 px-1 text-[10px] uppercase tracking-wider text-gray-600">
                  <span>Price $</span><span>Ammo</span><span>Label (optional)</span><span>Live</span><span></span>
                </div>
                {packs.length === 0 && (
                  <div className="text-xs text-gray-500 py-3">No packs yet. Add one to start selling.</div>
                )}
                {packs.map(p => (
                  <div key={p.id} className="grid grid-cols-[1fr_1fr_1.2fr_auto_auto] gap-2 items-center">
                    <input type="number" step="0.01" min="0" value={p.price_usd}
                      onChange={e => updatePack(p.id, { price_usd: Number(e.target.value) })}
                      className="bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary" />
                    <input type="number" step="1" min="0" value={p.ammo}
                      onChange={e => updatePack(p.id, { ammo: Number(e.target.value) })}
                      className="bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-primary" />
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
                ))}
              </div>
            </div>

            {/* Money split */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">Money split</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Of every dollar taken, this share goes to the weekly payout pool. The house keeps the rest. Banked at purchase, never shown to players.
              </p>

              <div className="flex items-end gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-600">Treasury (pool)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" step="1" min="0" max="100" value={treasuryPct}
                      onChange={e => setTreasuryPct(Number(e.target.value))}
                      className="w-20 bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-2 text-lg font-bold text-white focus:outline-none focus:border-primary" />
                    <span className="text-gray-500">%</span>
                  </div>
                </div>
                <div className="flex-1 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600">House keeps</div>
                  <div className="text-2xl font-bold text-white mt-1">{(100 - (Number(treasuryPct) || 0)).toFixed(0)}%</div>
                </div>
              </div>

              <div className="mt-auto">
                <button onClick={saveConfig} disabled={savingCfg}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-black font-semibold rounded-lg py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50">
                  {savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save packs & split
                </button>
                {cfgMsg && (
                  <div className={`mt-2 text-xs flex items-center gap-1.5 ${cfgMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {cfgMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {cfgMsg.text}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Daily free track picker */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">Daily free track</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Every track plays for everyone as normal music. This is the single track where a play with zero Ammo still counts as a qualified play, one per account per UTC day, and it earns zero Node Power. It's the daily free taste. To climb the board, people buy Ammo.
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={featuredId ?? ""}
                  onChange={(e) => saveTrack(e.target.value)}
                  disabled={savingTrack}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                >
                  <option value="">None (no free play)</option>
                  {tracks.map(t => (
                    <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>
                  ))}
                </select>
                {savingTrack && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
              </div>

              <div className="mt-3 text-xs">
                {trackErr ? (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" /> Couldn't save. Try selecting it again.
                  </span>
                ) : featuredId ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Live now: free plays are on for “{tracks.find(t => t.id === featuredId)?.title ?? "the selected track"}”.{trackSaved ? " Saved." : ""}
                  </span>
                ) : (
                  <span className="text-gray-500">
                    No free track set, so no free plays are running. Pick one to switch it on.
                  </span>
                )}
              </div>
            </div>

            {/* Grant form */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">Grant Ammo</h2>
              </div>
              <p className="text-xs text-amber-500/80 mb-4">
                Ammo is non-refundable and non-transferable. A grant is permanent free credit — log a clear reason.
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
              <div className="px-6 py-8 text-sm text-gray-600">No Ammo balances yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-6 py-3 font-medium">User</th>
                      <th className="text-left px-6 py-3 font-medium">ID</th>
                      <th className="text-right px-6 py-3 font-medium">Ammo</th>
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
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-white">Recent purchases</h2>
            </div>
            {purchases.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No purchases yet — the on-chain buy rail ships in Phase 1B.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-6 py-3 font-medium">When</th>
                      <th className="text-left px-6 py-3 font-medium">User</th>
                      <th className="text-right px-6 py-3 font-medium">Ammo</th>
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
