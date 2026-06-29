"use client"

import { useEffect, useState } from "react"
import { Share2, Users, Coins, TrendingUp, Loader2, Save, Check, ArrowRight, Network } from "lucide-react"

type TopRef = { name: string; referrals: number; l1_spins: number; l2_spins: number; total_spins: number }
type Recent = { level: number; spins: number; created_at: string; beneficiary: string; source: string }
type Data = {
  l1_pct: number; l2_pct: number
  total_referred: number; active_referrers: number; total_commission_spins: number
  top_referrers: TopRef[]; recent: Recent[]
}
const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const pctOf = (frac: number) => `${Math.round((frac || 0) * 1000) / 10}%`

export default function ReferralsPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [l1, setL1] = useState("20")
  const [l2, setL2] = useState("5")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState("")

  const load = () => {
    fetch("/api/admin/referrals", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Data) => {
        setD(data)
        if (Number.isFinite(data.l1_pct)) setL1(String(Math.round(data.l1_pct * 1000) / 10))
        if (Number.isFinite(data.l2_pct)) setL2(String(Math.round(data.l2_pct * 1000) / 10))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const saveRates = async () => {
    setSaving(true); setErr(""); setSaved(false)
    try {
      const res = await fetch("/api/admin/referrals/rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ l1_pct: Number(l1), l2_pct: Number(l2) }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not save"); return }
      setSaved(true); setTimeout(() => setSaved(false), 1800)
    } catch { setErr("Could not save") }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
  if (!d) return <div className="p-10 text-gray-500">Could not load referrals.</div>

  const Card = ({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string; hint?: string; accent?: string }) => (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1.5" style={{ color: accent || "#fff" }}>{value}</div>
      {hint && <div className="text-[11px] text-gray-600 mt-1">{hint}</div>}
    </div>
  )

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Two levels deep, paid in Spins, on confirmed purchases only — never on signups. Commission credits a referrer&apos;s balance automatically.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card icon={Users} label="Referred users" value={fmt(d.total_referred)} hint="people put on" />
        <Card icon={Network} label="Active referrers" value={fmt(d.active_referrers)} hint="have earned commission" />
        <Card icon={Coins} label="Commission paid" value={fmt(d.total_commission_spins)} accent="#c6ff2e" hint="Spins, all time" />
        <Card icon={TrendingUp} label="Rates L1 / L2" value={`${pctOf(d.l1_pct)} / ${pctOf(d.l2_pct)}`} hint="of Spins bought" />
      </div>

      {/* Rates editor */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-white">Commission rates</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Share of every Spins purchase paid to the buyer&apos;s referrer (L1) and that referrer&apos;s referrer (L2). Changes apply to purchases confirmed from now on.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Level 1</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="number" step="0.5" min="0" max="100" value={l1} onChange={(e) => setL1(e.target.value)}
                className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:outline-none focus:border-primary" />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Level 2</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="number" step="0.5" min="0" max="100" value={l2} onChange={(e) => setL2(e.target.value)}
                className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:outline-none focus:border-primary" />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <button onClick={saveRates} disabled={saving}
            className="ml-auto flex items-center gap-2 bg-primary text-gray-950 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved" : "Save rates"}
          </button>
        </div>
        {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
      </div>

      {/* Top referrers */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden mb-8">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
          <Network className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-white">Top referrers</h2>
        </div>
        {d.top_referrers.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-600">No referrals yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-600 border-b border-gray-800">
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Referrer</th>
                  <th className="px-6 py-3 font-medium text-right">Referrals</th>
                  <th className="px-6 py-3 font-medium text-right">L1 Spins</th>
                  <th className="px-6 py-3 font-medium text-right">L2 Spins</th>
                  <th className="px-6 py-3 font-medium text-right">Total Spins</th>
                </tr>
              </thead>
              <tbody>
                {d.top_referrers.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/60 last:border-0">
                    <td className="px-6 py-3 text-gray-600 tabular-nums">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-white">{r.name}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-300">{fmt(r.referrals)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-400">{fmt(r.l1_spins)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-400">{fmt(r.l2_spins)}</td>
                    <td className="px-6 py-3 text-right tabular-nums font-semibold" style={{ color: "#c6ff2e" }}>{fmt(r.total_spins)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent commissions */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-white">Recent commissions</h2>
        </div>
        {d.recent.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-600">No commissions paid yet.</div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {d.recent.map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3 text-sm">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.level === 1 ? "text-primary border border-primary/30" : "text-gray-400 border border-gray-700"}`}>L{c.level}</span>
                <div className="flex items-center gap-1.5 min-w-0 text-gray-300">
                  <span className="font-medium text-white truncate">{c.beneficiary}</span>
                  <ArrowRight className="w-3 h-3 text-gray-600 shrink-0 rotate-180" />
                  <span className="text-gray-500 truncate">{c.source}</span>
                </div>
                <span className="ml-auto tabular-nums font-semibold shrink-0" style={{ color: "#c6ff2e" }}>+{fmt(c.spins)}</span>
                <span className="text-[11px] text-gray-600 shrink-0 w-20 text-right">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
