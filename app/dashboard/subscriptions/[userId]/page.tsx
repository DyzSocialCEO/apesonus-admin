"use client"

import { useEffect, useState, useCallback, use } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Loader2, RefreshCw, Crown, AlertCircle,
  Clock, Plus, Minus, Ban,
} from "lucide-react"

interface SubRow {
  id: number
  plan_duration: string
  source: string
  status: string
  starts_at: string
  expires_at: string
  sol_amount_lamports: number | null
  sol_tx_signature: string | null
  granted_by: string | null
  grant_reason: string | null
  created_at: string
  revoked_at: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

export default function UserSubscriptionsPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = use(params)
  const [rows, setRows] = useState<SubRow[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgErr, setMsgErr] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/subscriptions?search=${encodeURIComponent(userId)}&limit=200`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const all = (data.rows || []) as any[]
      const mine = all.filter((r) => r.user_id === userId)
      setRows(mine.map(({ users: _drop, ...rest }: any) => rest))
      if (mine[0]?.users) setUser(mine[0].users)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Load failed")
      setMsgErr(true)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchData() }, [fetchData])

  const onExtend = async (id: number, seconds: number) => {
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend", seconds }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setMsg("Extended."); setMsgErr(false); fetchData()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed"); setMsgErr(true)
    }
  }

  const onExpire = async (id: number) => {
    if (!confirm("Force this subscription to expire now?")) return
    try {
      const res = await fetch(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire" }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setMsg("Expired."); setMsgErr(false); fetchData()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed"); setMsgErr(true)
    }
  }

  const onRevoke = async (id: number) => {
    const reason = prompt("Revoke reason (optional):")
    if (reason === null) return
    try {
      const res = await fetch(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", reason: reason || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setMsg("Revoked."); setMsgErr(false); fetchData()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed"); setMsgErr(true)
    }
  }

  const activeRow = rows.find(
    (r) => r.status === "active" && new Date(r.expires_at).getTime() > Date.now(),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/subscriptions"
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            {user?.display_name || user?.email || userId.slice(0, 12)}
          </h1>
          <p className="text-xs text-gray-500 font-mono">{userId}</p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${msgErr ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          <AlertCircle className="w-4 h-4" />
          {msg}
        </div>
      )}

      {/* Current status */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            {user?.genesis_holder_number != null && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-0">
                <Crown className="w-3 h-3 mr-1" />
                Genesis #{user.genesis_holder_number}
              </Badge>
            )}
            <Badge className={`border-0 ${
              user?.premium_status === "genesis" ? "bg-yellow-500/20 text-yellow-400" :
              user?.premium_status === "standard" ? "bg-blue-500/20 text-blue-400" :
              "bg-gray-500/20 text-gray-400"
            }`}>
              {(user?.premium_status || "none").toUpperCase()}
            </Badge>
          </div>

          {activeRow && (
            <div className="pt-3 border-t border-gray-800">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active subscription</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Pair label="Plan" value={activeRow.plan_duration} />
                <Pair label="Source" value={activeRow.source.replace("_", " ")} />
                <Pair label="Starts" value={fmtDate(activeRow.starts_at)} />
                <Pair label="Expires" value={fmtDate(activeRow.expires_at)} />
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => onExtend(activeRow.id, 300)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> +5 min
                </button>
                <button onClick={() => onExtend(activeRow.id, 3600)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> +1 hour
                </button>
                <button onClick={() => onExtend(activeRow.id, 86400)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> +1 day
                </button>
                <button onClick={() => onExtend(activeRow.id, 2592000)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> +30 days
                </button>
                <button onClick={() => onExpire(activeRow.id)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Expire now
                </button>
                <button onClick={() => onRevoke(activeRow.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Revoke
                </button>
              </div>
            </div>
          )}

          {!activeRow && (
            <div className="pt-3 border-t border-gray-800 text-sm text-gray-500">
              No active subscription. Use "Manual grant" on the list page to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">History</h2>
          </div>
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">No subscription history.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Created</th>
                  <th className="text-left px-5 py-3 font-medium">Plan</th>
                  <th className="text-left px-5 py-3 font-medium">Source</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Expires</th>
                  <th className="text-left px-5 py-3 font-medium">By / Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-5 py-3 text-xs text-gray-400">{fmtDate(r.created_at)}</td>
                    <td className="px-5 py-3 text-sm text-white capitalize">{r.plan_duration}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{r.source.replace("_", " ")}</td>
                    <td className="px-5 py-3 text-sm capitalize text-gray-300">{r.status}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{fmtDate(r.expires_at)}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-[240px] truncate">
                      {r.granted_by || "—"}{r.grant_reason ? ` — ${r.grant_reason}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-white">{value ?? "—"}</div>
    </div>
  )
}
