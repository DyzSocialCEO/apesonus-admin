"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, Loader2, RefreshCw, Crown, Clock, CheckCircle2,
  XCircle, Plus, AlertCircle, ChevronRight,
} from "lucide-react"

interface Row {
  id: number
  user_id: string
  plan_duration: string
  source: string
  status: string
  starts_at: string
  expires_at: string
  sol_amount_lamports: number | null
  sol_tx_signature: string | null
  sol_usd_price_at_payment: number | null
  yearly_bonus_cp: number | null
  granted_by: string | null
  grant_reason: string | null
  created_at: string
  revoked_at: string | null
  users: {
    id: string
    display_name: string | null
    email: string | null
    premium_status: string | null
    genesis_holder_number: number | null
    wallet_address: string | null
  }
}

interface Stats {
  activeCount: number
  genesisCount: number
  standardCount: number
  expiredCount: number
  revenueUsd: number
}

type FilterKey = "all" | "active" | "expired" | "revoked" | "genesis" | "standard" | "expiring_soon"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expiring_soon", label: "Expiring 7d" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
  { key: "genesis", label: "Genesis" },
  { key: "standard", label: "Standard" },
]

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function fmtRemaining(iso: string | null): string {
  if (!iso) return ""
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return `expired ${Math.floor(-ms / 86_400_000)}d ago`
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  if (d > 0) return `${d}d ${h}h left`
  return `${h}h left`
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [msg, setMsg] = useState<string | null>(null)
  const [msgErr, setMsgErr] = useState(false)

  // Grant modal
  const [showGrant, setShowGrant] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ filter, search }).toString()
      const res = await fetch(`/api/admin/subscriptions?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.rows || [])
      setStats(data.stats || null)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Load failed")
      setMsgErr(true)
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-gray-400">SOL-based subscriptions, Genesis, and admin grants.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRows}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGrant(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Manual grant
          </button>
        </div>
      </div>

      {/* Banner messages */}
      {msg && (
        <div
          className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            msgErr ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          {msg}
          <button onClick={() => setMsg(null)} className="ml-auto text-xs underline">
            dismiss
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Active" value={stats?.activeCount ?? "—"} icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} />
        <StatCard label="Genesis" value={stats?.genesisCount ?? "—"} icon={<Crown className="w-4 h-4 text-yellow-400" />} />
        <StatCard label="Standard" value={stats?.standardCount ?? "—"} icon={<Clock className="w-4 h-4 text-blue-400" />} />
        <StatCard label="Expired" value={stats?.expiredCount ?? "—"} icon={<XCircle className="w-4 h-4 text-gray-400" />} />
        <StatCard label="Revenue (USD)" value={stats ? `$${stats.revenueUsd.toLocaleString()}` : "—"} icon={null} />
      </div>

      {/* Search + filters */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by display name, email, or user id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-gray-800 border-gray-700"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-3 py-1.5 rounded-full transition ${
                  filter === f.key
                    ? "bg-yellow-500 text-black font-semibold"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">No rows match these filters.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Source</th>
                  <th className="text-left px-4 py-3 font-medium">Expires</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-right px-4 py-3 font-medium pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isGenesis = r.users?.genesis_holder_number != null
                  const lamports = Number(r.sol_amount_lamports || 0)
                  const sol = lamports > 0 ? (lamports / 1_000_000_000).toFixed(3) : null
                  return (
                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <div className="text-white text-sm font-medium">
                          {r.users?.display_name || r.users?.email || r.user_id.slice(0, 8)}
                          {isGenesis && (
                            <Badge className="ml-2 bg-yellow-500/20 text-yellow-400 border-0 text-[10px]">
                              GENESIS #{r.users?.genesis_holder_number}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{r.users?.email || r.user_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 capitalize">{r.plan_duration}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} expiresAt={r.expires_at} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{r.source.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-300">{fmtDateShort(r.expires_at)}</div>
                        <div className="text-xs text-gray-500">{fmtRemaining(r.expires_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {sol ? (
                          <>
                            <div className="text-white">{sol} SOL</div>
                            {r.sol_usd_price_at_payment && (
                              <div className="text-xs text-gray-500">
                                ${((lamports / 1e9) * Number(r.sol_usd_price_at_payment)).toFixed(2)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right pr-4">
                        <Link
                          href={`/dashboard/subscriptions/${r.user_id}`}
                          className="inline-flex items-center text-xs text-gray-400 hover:text-white"
                        >
                          Open <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showGrant && (
        <ManualGrantModal
          onClose={() => setShowGrant(false)}
          onGranted={() => {
            setShowGrant(false)
            setMsg("Subscription granted.")
            setMsgErr(false)
            fetchRows()
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        </div>
        <div className="text-xl font-bold text-white">{value}</div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status, expiresAt }: { status: string; expiresAt: string }) {
  const expiredByDate = new Date(expiresAt).getTime() < Date.now()
  const effective = status === "active" && expiredByDate ? "lapsed" : status
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    expired: "bg-gray-500/20 text-gray-400",
    revoked: "bg-red-500/20 text-red-400",
    lapsed: "bg-amber-500/20 text-amber-400",
  }
  return (
    <Badge className={`${colors[effective] || colors.active} border-0 text-[10px]`}>
      {effective.toUpperCase()}
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Manual grant modal
// ─────────────────────────────────────────────────────────────────────

function ManualGrantModal({ onClose, onGranted }: { onClose: () => void; onGranted: () => void }) {
  const [userId, setUserId] = useState("")
  const [duration, setDuration] = useState<"month" | "year" | "custom">("month")
  const [customSeconds, setCustomSeconds] = useState("300")
  const [source, setSource] = useState<"admin_grant" | "admin_test">("admin_grant")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async () => {
    setErr(null)
    if (!userId.trim()) {
      setErr("user id required")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          duration,
          customSeconds: duration === "custom" ? Number(customSeconds) : undefined,
          source,
          reason: reason.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body.error || `Failed (${res.status})`)
        setSubmitting(false)
        return
      }
      onGranted()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error")
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-1">Manual subscription grant</h2>
        <p className="text-xs text-gray-500 mb-5">
          Skip on-chain payment. Yearly grants with source=Admin Grant award the configured yearly bonus CP.
          Admin Test grants do not.
        </p>

        <div className="space-y-3">
          <Field label="User ID (UUID)">
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-…" className="bg-gray-800 border-gray-700 font-mono text-xs" />
          </Field>

          <Field label="Duration">
            <div className="flex gap-2">
              {(["month", "year", "custom"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg ${
                    duration === d
                      ? "bg-yellow-500 text-black font-semibold"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {d === "month" ? "1 Month" : d === "year" ? "1 Year" : "Custom"}
                </button>
              ))}
            </div>
          </Field>

          {duration === "custom" && (
            <Field label="Custom seconds (e.g. 300 = 5 min for testing)">
              <Input
                type="number"
                value={customSeconds}
                onChange={(e) => setCustomSeconds(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
              <div className="flex gap-1 mt-2">
                {[
                  { label: "5 min", v: 300 },
                  { label: "1 hr", v: 3600 },
                  { label: "1 day", v: 86400 },
                  { label: "30d", v: 2592000 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setCustomSeconds(String(p.v))}
                    className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-white"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Source">
            <div className="flex gap-2">
              <button
                onClick={() => setSource("admin_grant")}
                className={`flex-1 text-xs px-3 py-2 rounded-lg ${
                  source === "admin_grant"
                    ? "bg-yellow-500 text-black font-semibold"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                Admin Grant (real)
              </button>
              <button
                onClick={() => setSource("admin_test")}
                className={`flex-1 text-xs px-3 py-2 rounded-lg ${
                  source === "admin_test"
                    ? "bg-yellow-500 text-black font-semibold"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                Admin Test (no bonus CP)
              </button>
            </div>
          </Field>

          <Field label="Reason (optional, max 500 chars)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              placeholder="testing genesis card flow"
            />
          </Field>

          {err && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
              {err}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm">
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Grant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
