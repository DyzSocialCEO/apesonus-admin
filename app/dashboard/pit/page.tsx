"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Swords, Loader2, Search, RefreshCw, Crosshair, Activity } from "lucide-react"

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return Math.round(n).toLocaleString()
}

const COLOR: Record<string, string> = {
  "chartnobyl-bro": "#c6ff2e", "lola-likwidity": "#ff2e7e", "mcbagholder": "#ffc847",
  "coinalisa": "#5ac8fa", "dj-dustwallet": "#a855f7", "shilliam-dafoe": "#ff8a3d", "satosheek": "#7af5c0",
}

function stateBadge(state: string, detail: number) {
  if (state === "grace") return <Badge className="bg-lime-500/15 text-lime-400 border-0">Safe · {Math.ceil(detail)}h</Badge>
  if (state === "bleeding") return <Badge className="bg-amber-500/15 text-amber-400 border-0">Bleeding · {Math.round(detail * 100)}%</Badge>
  return <Badge className="bg-gray-500/15 text-gray-400 border-0">Dead</Badge>
}

export default function PitInspectorPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)

  const fetchData = async (user?: string) => {
    if (user) setSearching(true); else setLoading(true)
    try {
      const url = user ? `/api/admin/pit?user=${encodeURIComponent(user)}` : "/api/admin/pit"
      const res = await fetch(url)
      setData(await res.json())
    } catch {} finally { setLoading(false); setSearching(false) }
  }

  useEffect(() => { fetchData() }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  const factions = data?.factions ?? []
  const maxNp = Math.max(1, ...factions.map((f: any) => f.total_np))
  const user = data?.user

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">THE PIT</h1>
            <p className="text-sm text-gray-500">Node Power inspector</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><Activity className="w-4 h-4" /> NP in play</div>
            <div className="text-2xl font-bold text-white">{formatNum(data?.totals?.total_np ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><Crosshair className="w-4 h-4" /> Qualified plays</div>
            <div className="text-2xl font-bold text-white">{formatNum(data?.totals?.qualified_plays ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><Swords className="w-4 h-4" /> Factions</div>
            <div className="text-2xl font-bold text-white">{factions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Faction standings */}
      <Card>
        <CardHeader><CardTitle className="text-white">Faction standings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {factions.map((f: any, i: number) => {
            const c = COLOR[f.artist_id] || "#c6ff2e"
            const pct = (f.total_np / maxNp) * 100
            return (
              <div key={f.artist_id}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-white font-medium flex-1">{f.name}</span>
                  <span className="font-mono" style={{ color: c }}>{formatNum(f.total_np)} NP</span>
                </div>
                <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
                </div>
                <div className="mt-1 ml-9 text-xs text-gray-500 font-mono">
                  {f.players} scouts · {formatNum(f.lifetime_streams)} lifetime streams
                  {f.lifetime_streams < 100 && <span style={{ color: c }}> · undervalued</span>}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* User lookup */}
      <Card>
        <CardHeader><CardTitle className="text-white">Inspect a player</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="User ID, display name, or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && query.trim() && fetchData(query.trim())}
            />
            <Button onClick={() => query.trim() && fetchData(query.trim())} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {user && !user.found && (
            <p className="text-sm text-gray-500">No player matched “{user.query}”.</p>
          )}

          {user && user.found && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Ammo</span>
                <span className="font-mono text-amber-400">{formatNum(user.ammo)}</span>
                <span className="text-gray-700 font-mono text-xs truncate">{user.user_id}</span>
              </div>
              {user.nodes.length === 0 ? (
                <p className="text-sm text-gray-500">This player holds no nodes.</p>
              ) : (
                <div className="space-y-2">
                  {user.nodes.map((n: any) => (
                    <div key={n.artist_id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLOR[n.artist_id] || "#c6ff2e" }} />
                      <span className="text-white text-sm flex-1">{n.name}</span>
                      <span className="font-mono text-sm" style={{ color: COLOR[n.artist_id] || "#c6ff2e" }}>{formatNum(n.np)} NP</span>
                      {stateBadge(n.state, n.detail)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
