"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Coins, Loader2, Send, Trophy, Activity, RefreshCw, TrendingUp, Users, Flame } from "lucide-react"

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString()
}

export default function OnusPointsPage() {
  const [users, setUsers] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const [awardId, setAwardId] = useState("")
  const [awardAmount, setAwardAmount] = useState("")
  const [awardReason, setAwardReason] = useState("")
  const [awarding, setAwarding] = useState(false)
  const [msg, setMsg] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/onus")
      const data = await res.json()
      setUsers(data.users || [])
      setTransactions(data.transactions || [])
      setStats(data.stats || {})
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleAward = async () => {
    if (!awardId || !awardAmount || !awardReason) { setMsg("All fields required"); return }
    setAwarding(true); setMsg("")
    try {
      const res = await fetch("/api/admin/onus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId: awardId, amount: parseInt(awardAmount), reason: awardReason }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(`Awarded ${awardAmount} $ONUS!`)
        setAwardId(""); setAwardAmount(""); setAwardReason("")
        fetchData()
      } else {
        setMsg(`Error: ${data.error}`)
      }
    } catch { setMsg("Failed") } finally { setAwarding(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  const pctUsed = parseFloat(stats.percentUsed || "0")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Coins className="w-6 h-6 text-[#ffc847]" /> $ONUS Supply
          </h2>
          <p className="text-gray-400 text-sm">Token distribution tracking</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Supply Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Total Supply</p>
            <p className="text-xl font-black text-white">{formatNum(stats.totalSupply || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">User Pool</p>
            <p className="text-xl font-black text-[#ffc847]">{formatNum(stats.userPool || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Distributed</p>
            <p className="text-xl font-black text-green-400">{formatNum(stats.totalDistributed || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Remaining</p>
            <p className="text-xl font-black text-blue-400">{formatNum(stats.remaining || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Supply Progress Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Distribution Progress</span>
            <span className="text-sm font-bold text-[#ffc847]">{pctUsed}%</span>
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pctUsed, 100)}%`,
                background: pctUsed > 90 ? "#ef4444" : pctUsed > 70 ? "#f97316" : "linear-gradient(90deg, #ffc847, #22c55e)",
              }} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-600">{formatNum(stats.totalDistributed || 0)} distributed</span>
            <span className="text-xs text-gray-600">{formatNum(stats.remaining || 0)} remaining</span>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-gray-500">Total Users</p>
              <p className="text-lg font-bold text-white">{stats.totalUsers || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-[#ffc847]" />
            <div>
              <p className="text-xs text-gray-500">Earning</p>
              <p className="text-lg font-bold text-white">{stats.usersWithPoints || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Flame className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-xs text-gray-500">24h Burn</p>
              <p className="text-lg font-bold text-white">{formatNum(stats.dailyBurn || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-xs text-gray-500">Est. Days Left</p>
              <p className="text-lg font-bold text-white">{stats.estimatedDaysLeft ?? "∞"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {msg}
        </div>
      )}

      {/* Award Form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Manual Award</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="Telegram ID" value={awardId} onChange={e => setAwardId(e.target.value)} />
            <Input placeholder="Amount" type="number" value={awardAmount} onChange={e => setAwardAmount(e.target.value)} />
            <Input placeholder="Reason" value={awardReason} onChange={e => setAwardReason(e.target.value)} />
          </div>
          <Button onClick={handleAward} disabled={awarding} className="mt-3">
            {awarding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Award $ONUS
          </Button>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#ffc847]" /> Leaderboard (Top 100)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-4 text-xs text-gray-500">#</th>
                  <th className="text-left py-3 px-4 text-xs text-gray-500">User</th>
                  <th className="text-center py-3 px-4 text-xs text-gray-500">Tier</th>
                  <th className="text-right py-3 px-4 text-xs text-gray-500">$ONUS</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any, i: number) => (
                  <tr key={user.telegram_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2.5 px-4 text-sm text-gray-500">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <p className="text-sm text-white font-medium">{user.first_name || user.username || "Anon"}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{user.telegram_id}</p>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {user.verification_tier ? (
                        <Badge className={`text-[10px] ${
                          user.verification_tier === "genesis" ? "bg-yellow-500/20 text-yellow-400" :
                          user.verification_tier === "early" ? "bg-blue-500/20 text-blue-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>
                          {user.verification_tier}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-gray-600">free</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm font-bold text-[#ffc847]">
                      {(user.total_onus || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-600">No users with ONUS yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> Recent Transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-64 overflow-y-auto">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50">
                <div>
                  <p className="text-xs text-white font-mono">{tx.telegram_id}</p>
                  <p className="text-[10px] text-gray-500">{tx.reason}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-gray-600">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <p className="py-8 text-center text-gray-600">No transactions yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
