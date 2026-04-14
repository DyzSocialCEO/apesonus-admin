"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Star, Loader2, RefreshCw, Send, Check, X, Trash2, AlertTriangle, Trophy } from "lucide-react"

interface WhaleUser {
  telegram_id: string
  username: string | null
  first_name: string | null
  onus_balance: number
  weekly_onus_earned: number | null
  genesis_badge: boolean
}

interface Payout {
  id: number
  telegram_id: string
  amount: number
  week_start: string
  status: "pending" | "sent" | "failed"
  sent_at: string | null
  notes: string | null
  created_at: string
}

interface PoolData {
  config: { weekly_amount: number; active: boolean; last_distributed: string | null }
  currentWeek: string
  whales: WhaleUser[]
  thisWeekPayouts: Payout[]
  history: { week_start: string; amount: number; status: string }[]
}

export default function WhalePoolPage() {
  const [data, setData] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [poolInput, setPoolInput] = useState("")
  const [topN, setTopN] = useState("10")

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/whale-pool")
      const d = await res.json()
      if (!d.error) {
        setData(d)
        setPoolInput(String(d.config?.weekly_amount || 0))
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const post = async (action: string, payload: Record<string, any> = {}) => {
    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/whale-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      })
      const d = await res.json()
      if (d.success) { setMsg("Done"); fetchData() }
      else setMsg(d.error || "Failed")
    } catch { setMsg("Failed") } finally { setBusy(false) }
  }

  const handleSetAmount = () => post("set_amount", { amount: parseInt(poolInput) || 0 })

  const handleDistribute = () => {
    const n = parseInt(topN) || 10
    if (!confirm(`Distribute ${data?.config.weekly_amount || 0} Stars across the top ${n} WHALEs by weekly $ONUS earned? Payouts are pro-rata.`)) return
    post("distribute", { topN: n })
  }

  const handleMarkSent = (id: number) => {
    const notes = prompt("Optional notes (Telegram username sent to, txn ID, etc):") || ""
    post("mark_sent", { payoutId: id, notes })
  }

  const handleMarkFailed = (id: number) => {
    const notes = prompt("Failure reason:") || ""
    post("mark_failed", { payoutId: id, notes })
  }

  const handleDelete = (id: number) => {
    if (!confirm("Delete this pending payout?")) return
    post("delete_payout", { payoutId: id })
  }

  const userLabel = (tid: string) => {
    const w = data?.whales.find(w => w.telegram_id === tid)
    if (!w) return tid
    return w.username ? `@${w.username}` : (w.first_name || tid)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-400" /> WHALE Stars Pool
          </h1>
          <p className="text-sm text-gray-400">Weekly Telegram Stars distribution to top WHALE-tier earners</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Telegram Stars caveat */}
      <Card className="bg-yellow-400/5 border-yellow-400/20">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-100/80 leading-relaxed">
            <p className="font-semibold mb-1 text-yellow-200">Manual send workflow</p>
            <p>Telegram Bot API does not support sending arbitrary Stars amounts directly to users. After distributing the pool, send Stars manually from your Telegram account to each recipient, then mark each payout as <strong>Sent</strong>. This ledger keeps the audit trail.</p>
          </div>
        </CardContent>
      </Card>

      {loading || !data ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <>
          {/* ── Pool config ───────────────────────────────── */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base text-white">Weekly Pool Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Current Week</p>
                  <p className="text-sm font-bold text-white">{data.currentWeek}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Pool Amount</p>
                  <p className="text-sm font-bold text-yellow-400">{data.config.weekly_amount.toLocaleString()} ⭐</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Last Distributed</p>
                  <p className="text-xs font-medium text-white">
                    {data.config.last_distributed ? new Date(data.config.last_distributed).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-gray-400 mb-1 block">Set Weekly Pool Amount (Stars)</label>
                  <Input type="number" value={poolInput} onChange={e => setPoolInput(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <Button onClick={handleSetAmount} disabled={busy} className="bg-primary text-black">
                  Save Amount
                </Button>
              </div>

              <div className="flex gap-2 items-end flex-wrap pt-3 border-t border-gray-800">
                <div className="w-32">
                  <label className="text-xs text-gray-400 mb-1 block">Top N Whales</label>
                  <Input type="number" value={topN} onChange={e => setTopN(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <Button onClick={handleDistribute} disabled={busy || data.config.weekly_amount <= 0}
                  className="bg-yellow-400 text-black hover:bg-yellow-300">
                  {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Distribute Pool for {data.currentWeek}
                </Button>
              </div>

              {msg && <p className="text-xs text-gray-300">{msg}</p>}
            </CardContent>
          </Card>

          {/* ── This week's payouts ──────────────────────── */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" /> This Week's Payouts ({data.thisWeekPayouts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.thisWeekPayouts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No payouts yet for this week. Distribute the pool above.</p>
              ) : (
                <div className="space-y-2">
                  {data.thisWeekPayouts
                    .sort((a, b) => b.amount - a.amount)
                    .map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-gray-500 w-6">#{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{userLabel(p.telegram_id)}</p>
                            <p className="text-[10px] text-gray-500 truncate">ID: {p.telegram_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-yellow-400">{p.amount} ⭐</span>
                          <Badge className={
                            p.status === "sent" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                            p.status === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                            "bg-gray-700/50 text-gray-400 border-gray-700"
                          }>{p.status}</Badge>
                          {p.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => handleMarkSent(p.id)}
                                className="border-green-500/30 text-green-400 hover:bg-green-900/20">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleMarkFailed(p.id)}
                                className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)}
                                className="border-gray-700 text-gray-400 hover:bg-gray-800">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── WHALE leaderboard ────────────────────────── */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base text-white">WHALE Leaderboard (by weekly $ONUS collected)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.whales.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No WHALE subscribers yet.</p>
              ) : (
                <div className="space-y-1">
                  {data.whales.slice(0, 20).map((w, i) => (
                    <div key={w.telegram_id} className="flex items-center justify-between p-2 rounded text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-gray-500 w-6">#{i + 1}</span>
                        <span className="text-white truncate">
                          {w.username ? `@${w.username}` : (w.first_name || w.telegram_id)}
                          {w.genesis_badge && <span className="ml-1 text-yellow-400">👑</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-gray-400">
                        <span>weekly: <span className="text-primary font-medium">{(w.weekly_onus_earned || 0).toLocaleString()}</span></span>
                        <span>balance: {w.onus_balance.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
