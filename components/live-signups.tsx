"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { UserPlus, Loader2 } from "lucide-react"

type Sig = { handle: string; created_at: string }
type Data = { users: Sig[]; total: number; today: number; last_hour: number }

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 30) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function LiveSignups() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const tick = () => {
      fetch("/api/admin/recent-users", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j) setD(j) })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false) })
    }
    tick()
    const id = setInterval(tick, 15_000) // poll every 15s for a live feel
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#c6ff2e" }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#c6ff2e" }} />
            </span>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-primary" /> Live signups</h2>
          </div>
          {d && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-400"><span className="font-bold text-white tabular-nums">{d.today.toLocaleString()}</span> today</span>
              <span className="text-gray-400"><span className="font-bold tabular-nums" style={{ color: "#c6ff2e" }}>{d.last_hour.toLocaleString()}</span> this hour</span>
              <span className="text-gray-500 hidden sm:inline"><span className="font-bold text-white tabular-nums">{d.total.toLocaleString()}</span> total</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-600" /></div>
        ) : !d || d.users.length === 0 ? (
          <p className="text-sm text-gray-600 py-4 text-center">No signups yet — they&apos;ll appear here the moment people join.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.users.map((u, i) => (
              <div key={i} className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-950 pl-1.5 pr-3 py-1.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-gray-950" style={{ background: i === 0 ? "#c6ff2e" : "#3f3f46", color: i === 0 ? "#0a0a0f" : "#a1a1aa" }}>
                  {u.handle.replace(/^ape_/, "").slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm text-white font-medium">{u.handle}</span>
                <span className="text-[11px] text-gray-500">{ago(u.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
