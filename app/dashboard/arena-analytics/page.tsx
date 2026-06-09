"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, PieChart, Coins, Flame, Trophy, Users, Lock, Skull, ShieldCheck } from "lucide-react"

type Global = {
  arenas_total: number; arenas_settled: number; arenas_live: number
  total_picks: number; total_backed: number; currently_locked: number
  total_clout_burned: number; total_payouts: number; participants: number
  danger_events: number; danger_saved: number; danger_purged: number
  danger_raised: number; danger_burned: number
  all_time_burned: number; emissions_reserve: number
}
type ArenaRow = { id: string; title: string; status: string; picks: number; backed: number; clout: number; payout: number; participants: number }

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300",
  open: "bg-emerald-500/15 text-emerald-400",
  revealing: "bg-amber-500/15 text-amber-400",
  settled: "bg-blue-500/15 text-blue-400",
  void: "bg-red-500/15 text-red-400",
}
const fmt = (n: number) => Number(n || 0).toLocaleString("en-US")

function StatCard({ icon: Icon, label, value, accent = "#c6ff2e", sub }: { icon: any; label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-400">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} /> {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function ArenaAnalyticsPage() {
  const [g, setG] = useState<Global | null>(null)
  const [rows, setRows] = useState<ArenaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/arena-analytics", { credentials: "include" })
        const data = await res.json()
        if (data.error) { setMsg(data.error); return }
        setG(data.global || null)
        setRows(data.perArena || [])
      } catch (e: any) { setMsg(e.message) } finally { setLoading(false) }
    })()
  }, [])

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center gap-3">
        <PieChart className="h-6 w-6 text-[#c6ff2e]" />
        <h1 className="text-2xl font-bold text-white">Arena Analytics</h1>
        <span className="text-sm text-zinc-500">Backing, clout & danger at a glance</span>
      </div>

      {msg && <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">{msg}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> loading</div>
      ) : !g ? (
        <div className="text-sm text-zinc-500">No data.</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-white">Arena — totals</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Coins} label="Total backed" value={fmt(g.total_backed)} sub={`${fmt(g.total_picks)} picks`} />
                <StatCard icon={Lock} label="Currently locked" value={fmt(g.currently_locked)} accent="#ffc847" sub="in live arenas" />
                <StatCard icon={Flame} label="Clout burned" value={fmt(g.total_clout_burned)} accent="#ff2e7e" />
                <StatCard icon={Trophy} label="Payouts paid" value={fmt(g.total_payouts)} accent="#3b82f6" />
                <StatCard icon={Users} label="Participants" value={fmt(g.participants)} />
                <StatCard icon={ShieldCheck} label="Arenas" value={fmt(g.arenas_total)} sub={`${fmt(g.arenas_live)} live · ${fmt(g.arenas_settled)} settled`} />
                <StatCard icon={Flame} label="All-time $ONUS burned" value={fmt(g.all_time_burned)} accent="#ff2e7e" sub="whole platform" />
                <StatCard icon={Coins} label="Emissions reserve" value={fmt(g.emissions_reserve)} accent="#ffc847" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-white">Danger Zone — totals</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Skull} label="Events" value={fmt(g.danger_events)} sub={`${fmt(g.danger_saved)} saved · ${fmt(g.danger_purged)} purged`} />
                <StatCard icon={ShieldCheck} label="Saved" value={fmt(g.danger_saved)} accent="#22c55e" />
                <StatCard icon={Skull} label="Purged" value={fmt(g.danger_purged)} accent="#ef4444" />
                <StatCard icon={Flame} label="$ONUS burned saving" value={fmt(g.danger_burned)} accent="#ff2e7e" sub={`${fmt(g.danger_raised)} rescue points raised`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-white">Per-arena breakdown</CardTitle></CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-sm text-zinc-500">No arenas yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                        <th className="py-2 pr-3 font-medium">Arena</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium text-right">Picks</th>
                        <th className="py-2 px-3 font-medium text-right">Backed</th>
                        <th className="py-2 px-3 font-medium text-right">Clout</th>
                        <th className="py-2 px-3 font-medium text-right">Payouts</th>
                        <th className="py-2 pl-3 font-medium text-right">Players</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-900">
                          <td className="py-2.5 pr-3 text-white font-medium">{r.title}</td>
                          <td className="py-2.5 px-3"><Badge className={STATUS_STYLE[r.status] || ""}>{r.status}</Badge></td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{fmt(r.picks)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{fmt(r.backed)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "#ff2e7e" }}>{fmt(r.clout)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "#3b82f6" }}>{fmt(r.payout)}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-zinc-300">{fmt(r.participants)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
