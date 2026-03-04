"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Coins, Loader2, Send, Trophy, Activity } from "lucide-react"

export default function OnusPointsPage() {
  const [users, setUsers] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [stats, setStats] = useState({ totalPoints: 0, usersWithPoints: 0 })
  const [loading, setLoading] = useState(true)

  // Award form
  const [awardId, setAwardId] = useState("")
  const [awardAmount, setAwardAmount] = useState("")
  const [awardReason, setAwardReason] = useState("")
  const [awarding, setAwarding] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/onus")
      const data = await res.json()
      setUsers(data.users || [])
      setTransactions(data.transactions || [])
      setStats(data.stats || { totalPoints: 0, usersWithPoints: 0 })
    } catch { } finally { setLoading(false) }
  }

  const handleAward = async () => {
    if (!awardId || !awardAmount || !awardReason) { setMsg("All fields required"); return }
    setAwarding(true); setMsg("")
    try {
      const res = await fetch("/api/admin/onus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: awardId,
          amount: parseInt(awardAmount),
          reason: awardReason,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(`Awarded ${awardAmount} points!`)
        setAwardId(""); setAwardAmount(""); setAwardReason("")
        await fetchData()
      } else { setMsg(data.error || "Failed") }
    } catch { setMsg("Failed to award") } finally { setAwarding(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">$ONUS Points</h1>
        <p className="text-gray-400">Manage rewards and point balances</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2">
              <Coins className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalPoints.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Total Points in Circulation</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-green-400/10 w-fit mb-2">
              <Trophy className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.usersWithPoints}</p>
            <p className="text-xs text-gray-500 mt-1">Users with Points</p>
          </CardContent>
        </Card>
      </div>

      {/* Manual Award */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> Award Points Manually
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {msg && (
            <div className={`p-2 rounded-lg text-sm ${msg.includes("Failed") || msg.includes("required") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
              {msg}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Input value={awardId} onChange={(e) => setAwardId(e.target.value)} placeholder="Telegram ID" />
            <Input type="number" value={awardAmount} onChange={(e) => setAwardAmount(e.target.value)} placeholder="Points" />
            <Input value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder="Reason (e.g. story_selected)" />
          </div>
          <Button onClick={handleAward} disabled={awarding} className="bg-primary text-black hover:bg-primary/90">
            {awarding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Award Points
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leaderboard */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" /> Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">#</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">User</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter((u) => (u.total_onus || 0) > 0).map((user, i) => (
                    <tr key={user.telegram_id} className="border-b border-gray-800/50">
                      <td className="py-2 px-4 text-gray-500 text-sm">{i + 1}</td>
                      <td className="py-2 px-4">
                        <p className="text-white text-sm">{user.first_name || user.username || user.telegram_id}</p>
                      </td>
                      <td className="py-2 px-4 text-right text-primary font-bold text-sm">{user.total_onus}</td>
                    </tr>
                  ))}
                  {users.filter((u) => (u.total_onus || 0) > 0).length === 0 && (
                    <tr><td colSpan={3} className="py-8 text-center text-gray-500 text-sm">No points awarded yet</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" /> Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">User</th>
                    <th className="text-center py-3 px-4 text-xs font-medium text-gray-400">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Reason</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-2 px-4 text-gray-400 text-xs font-mono">{tx.telegram_id}</td>
                      <td className="py-2 px-4 text-center text-primary font-bold text-sm">+{tx.amount}</td>
                      <td className="py-2 px-4 text-gray-400 text-xs">{tx.reason}</td>
                      <td className="py-2 px-4 text-right text-gray-500 text-xs">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-gray-500 text-sm">No transactions yet</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
