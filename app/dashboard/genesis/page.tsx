"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Crown, Loader2, Search, Trophy } from "lucide-react"

interface Holder {
  telegramId: string
  username: string | null
  firstName: string | null
  onusBalance: number
  totalOnus: number
  holderNumber: number
  isTop100: boolean
}

interface GenesisStatus {
  state: "not_started" | "active" | "expired"
  daysRemaining: number | null
  threshold: number
  maxHolders: number
  slotsLeft: number
  genesisBadgeCount: number
}

export default function GenesisPage() {
  const [holders, setHolders] = useState<Holder[]>([])
  const [status, setStatus] = useState<GenesisStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [hRes, sRes] = await Promise.all([
        fetch("/api/admin/genesis-holders"),
        fetch("/api/admin/genesis-window"),
      ])
      const hData = await hRes.json()
      const sData = await sRes.json()
      if (hRes.ok) setHolders(hData.holders || [])
      if (sRes.ok) setStatus(sData)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [])

  // Filter holders by query — match on holder number, telegram ID, username, or first name
  const filtered = holders.filter((h) => {
    if (!query.trim()) return true
    const q = query.toLowerCase().trim()
    return (
      String(h.holderNumber).includes(q) ||
      h.telegramId.includes(q) ||
      (h.username?.toLowerCase().includes(q) ?? false) ||
      (h.firstName?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Genesis Badge</h1>
        <p className="text-gray-400">Holder leaderboard and race status</p>
      </div>

      {/* ── RACE STATUS ─────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10">
              <Crown className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Race Status</CardTitle>
              <CardDescription>
                {status?.state === "not_started" && "Window has not started yet"}
                {status?.state === "active" && `Active — ${status.daysRemaining ?? "—"} days left`}
                {status?.state === "expired" && "Window has closed"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!status ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-gray-800/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Threshold</p>
                <p className="text-sm font-bold text-white">{status.threshold.toLocaleString()} $ONUS</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Max Slots</p>
                <p className="text-sm font-bold text-white">{status.maxHolders}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Minted</p>
                <p className="text-sm font-bold text-yellow-400">{status.genesisBadgeCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Slots Left</p>
                <p className="text-sm font-bold text-yellow-400">{status.slotsLeft}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── HOLDER LEADERBOARD ─────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-white">Holder Leaderboard</CardTitle>
              <CardDescription>Every minted Genesis Badge, ranked by holder number</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by holder #, telegram ID, username, or name"
                className="pl-10"
              />
            </div>

            {/* Loading / empty / list */}
            {loading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading holders...
              </div>
            ) : holders.length === 0 ? (
              <div className="py-8 text-center">
                <Crown className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No Genesis Badge holders yet.</p>
                <p className="text-xs text-gray-600 mt-1">
                  The race will begin once the window is opened in Settings.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                No holders match &quot;{query}&quot;
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">#</th>
                      <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Holder</th>
                      <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Telegram ID</th>
                      <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold text-right">Balance</th>
                      <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold text-right">Total Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((h) => (
                      <tr key={h.telegramId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-3">
                          <span className={h.isTop100 ? "font-bold text-yellow-400" : "font-semibold text-white"}>
                            #{h.holderNumber}
                          </span>
                          {h.isTop100 && <span className="ml-1 text-[10px] text-yellow-400/70">TOP 100</span>}
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-white">{h.firstName || h.username || "—"}</div>
                          {h.username && h.firstName && (
                            <div className="text-[11px] text-gray-500">@{h.username}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-400 font-mono text-xs">{h.telegramId}</td>
                        <td className="py-3 px-3 text-right text-white">{h.onusBalance.toLocaleString()}</td>
                        <td className="py-3 px-3 text-right text-gray-400">{h.totalOnus.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-gray-600 text-center pt-2">
              {filtered.length} of {holders.length} holders shown
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
