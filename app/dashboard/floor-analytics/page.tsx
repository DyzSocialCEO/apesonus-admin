"use client"

/**
 * /dashboard/floor-analytics — Floor Analytics
 *
 * The Floor's numbers in one place. Economy (Ammo in, out, held), the war
 * (Node Power across factions), the week (epoch + purse), 14-day trends of
 * plays and revenue, and the top holders. Reads /api/admin/floor-analytics.
 */

import { useEffect, useState, useCallback } from "react"
import {
  BarChart3, Fuel, Gift, Flame, DollarSign, Swords, Trophy, Users2, Loader2, Star,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts"

const FACTION_COLOR: Record<string, string> = {
  "chartnobyl-bro": "#c6ff2e", "lola-likwidity": "#ff2e7e", "mcbagholder": "#ffc847",
  "coinalisa": "#5ac8fa", "dj-dustwallet": "#a855f7", "shilliam-dafoe": "#ff8a3d", "satosheek": "#7af5c0",
}
const fmt = (n: number) => Math.round(n).toLocaleString("en-US")
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Stat({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <Icon className="w-4 h-4" style={{ color: accent }} /> {label}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

const tip = { background: "#0a0a0f", border: "1px solid #1f2937", borderRadius: 12, fontSize: 12 }

export default function FloorAnalyticsPage() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/floor-analytics")
      if (res.ok) setD(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  if (!d) return <div className="text-gray-500">No data.</div>

  const eco = d.economy, war = d.war, week = d.week, series = d.series || [], people = d.people
  const engagement = d.engagement || []
  const maxNp = Math.max(1, ...war.factions.map((f: any) => f.total_np))
  const epoch = week.epoch

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Floor Analytics</h1>
          <p className="text-sm text-gray-500">The economy, the war, and the week, end to end.</p>
        </div>
      </div>

      {/* ── ECONOMY ── */}
      <div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">Economy</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={DollarSign} label="Money in" value={money(eco.usdGrossCents)} sub={`${fmt(eco.counts.confirmed)} paid orders`} accent="#22c55e" />
          <Stat icon={Fuel} label="Ammo sold" value={fmt(eco.ammoSold)} sub={`${fmt(eco.outstanding)} held by ${fmt(eco.holders)} holders`} accent="#ffc847" />
          <Stat icon={Gift} label="Ammo granted" value={fmt(eco.ammoGranted)} accent="#a855f7" />
          <Stat icon={Flame} label="Ammo spent" value={fmt(eco.ammoSpent)} sub={`${fmt(eco.freeServed)} free plays served`} accent="#ff2e7e" />
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {(["confirmed", "pending", "expired", "failed"] as const).map((k) => (
            <span key={k} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-1.5 text-gray-400">
              {fmt(eco.counts[k] || 0)} <span className="text-gray-600">{k}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── TRENDS ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <div className="text-sm font-semibold text-white mb-1">Qualified plays · 14 days</div>
          <div className="text-xs text-gray-500 mb-4">Ammo plays build the board. Free plays are the daily taste.</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ammo" name="Ammo" stackId="p" fill="#ffc847" radius={[3, 3, 0, 0]} />
              <Bar dataKey="free" name="Free" stackId="p" fill="#5ac8fa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <div className="text-sm font-semibold text-white mb-1">Revenue · 14 days</div>
          <div className="text-xs text-gray-500 mb-4">USD from confirmed Ammo purchases, by day.</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(v: any) => [`$${v}`, "USD"]} />
              <Bar dataKey="usd" name="USD" fill="#c6ff2e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── COMMUNITY ENGAGEMENT ── */}
      <div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Swords className="w-3.5 h-3.5" /> Community engagement</div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl bg-gray-900 border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-white">Top players by engagement</div>
              <div className="text-xs text-gray-500">{fmt(war.totalNp)} NP · {fmt(war.qualifiedPlays)} plays</div>
            </div>
            <div className="text-xs text-gray-500 mb-4">Ranked by total Node Power across all artists × loyalty — the same weight the pool pays by. Not per-artist.</div>
            {engagement.length === 0 ? (
              <div className="text-sm text-gray-600">No engagement yet.</div>
            ) : (
              <div className="space-y-3">
                {engagement.map((p: any) => (
                  <div key={p.name + p.rank}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2"><span className="text-gray-600 font-mono w-5">{String(p.rank).padStart(2, "0")}</span><span className="text-white/85">{p.name}</span></span>
                      <span className="text-gray-500 font-mono">{(p.share * 100 > 0 && p.share * 100 < 0.1) ? "<0.1" : (p.share * 100).toFixed(1)}% · {fmt(p.weight)} wt</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden ml-7">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, p.share * 100)}%`, background: "#c6ff2e" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── THE WEEK ── */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3"><Trophy className="w-4 h-4 text-primary" /> This week</div>
            {epoch ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Epoch</span><span className="text-white">#{epoch.epoch_number}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-white capitalize">{epoch.status}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Purse</span><span className="text-white">{money((epoch.purse_usd || 0) * 100)}</span></div>
                {epoch.sponsor_name && <div className="flex justify-between"><span className="text-gray-500">Sponsor</span><span className="text-white">{epoch.sponsor_name}</span></div>}
                {epoch.winner_name && <div className="flex justify-between"><span className="text-gray-500">Winner</span><span className="text-white">{epoch.winner_name}</span></div>}
                {epoch.paid_total != null && <div className="flex justify-between"><span className="text-gray-500">Paid out</span><span className="text-white">{money((epoch.paid_total || 0) * 100)}</span></div>}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No active epoch. The season starts when you activate the genesis week.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── PEOPLE ── */}
      <div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Users2 className="w-3.5 h-3.5" /> Top Ammo holders</div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          {people.topHolders.length ? (
            <div className="space-y-2">
              {people.topHolders.map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-white/85 flex items-center gap-2">
                    <span className="text-gray-600 w-4">{i + 1}</span> {h.name}
                  </span>
                  <span className="text-gray-400 flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5 text-amber-400" /> {fmt(h.balance)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 flex items-center gap-2"><Star className="w-3.5 h-3.5" /> No Ammo balances yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
