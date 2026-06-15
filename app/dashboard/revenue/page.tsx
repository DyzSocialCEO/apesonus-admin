"use client"

import { useEffect, useState } from "react"
import { DollarSign, TrendingUp, Loader2 } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

type Data = {
  house_total: number; pool_total: number; gross_total: number
  house_24h: number; house_7d: number; house_30d: number
  purchases: number; treasury_pct: number | null
  series: { date: string; house: number; gross: number }[]
}
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function RevenuePage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/revenue", { cache: "no-store" })
      .then((r) => r.json()).then(setD).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
  if (!d) return <div className="p-10 text-gray-500">Could not load revenue.</div>

  const Card = ({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) => (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent || "#fff" }}>{value}</div>
      {hint && <div className="text-[11px] text-gray-600 mt-1">{hint}</div>}
    </div>
  )

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Your house take, the {d.treasury_pct != null ? `${100 - d.treasury_pct}%` : "house"} cut of every purchase. The rest funds the weekly pool. Players never see this.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card label="House take, all time" value={usd(d.house_total)} accent="#c6ff2e" hint={`${d.purchases} purchases`} />
        <Card label="Last 24 hours" value={usd(d.house_24h)} />
        <Card label="Last 7 days" value={usd(d.house_7d)} />
        <Card label="Last 30 days" value={usd(d.house_30d)} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Card label="Prize pool funded" value={usd(d.pool_total)} accent="#ffc847" hint="all time, into the weekly purse" />
        <Card label="Gross processed" value={usd(d.gross_total)} hint="total paid by players" />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 mb-4">
          <TrendingUp className="w-4 h-4" /> House take, last 30 days
        </div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={d.series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="houseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c6ff2e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#c6ff2e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }} formatter={(v: any) => [usd(Number(v)), "House"]} />
              <Area type="monotone" dataKey="house" stroke="#c6ff2e" strokeWidth={2} fill="url(#houseFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
