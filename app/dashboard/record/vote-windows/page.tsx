"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Vote, Plus, Loader2, Save, X, ArrowLeft, AlertTriangle, CheckCircle2,
  Clock, Trophy, Trash2, XCircle,
} from "lucide-react"

/**
 * /dashboard/record/vote-windows
 *
 * Open new vote windows, monitor live tallies, close early or delete
 * empty mistakes.
 *
 * Opening flow:
 *   1. Pick window type (Coin of the Month or Variable)
 *   2. Pick CoM date if CoM (defaults to first of current month)
 *   3. Pick opens_at (now by default) + closes_at (2 weeks by default)
 *   4. Tick 2+ pending nominations from the list to attach to the slate
 *   5. Save — nominations transition from pending → voting
 *
 * Winners are NOT manually settable. The close action calls
 * close_vote_window(id) RPC which atomically picks the winner.
 */

type WindowStatus = "open" | "closed" | "cancelled"
type WindowType = "coin_of_month" | "variable"

interface SlateNomination {
  id: number
  projectName: string
  projectKey: string
  nominationType: "celebration" | "funeral" | "coin_of_month"
  proposalText: string
  status: string
  voteCount: number
}

interface Nomination {
  id: number
  projectName: string
  projectKey: string
  nominationType: "celebration" | "funeral" | "coin_of_month"
  proposalText: string
  status: string
  endorsementCount: number
  createdAt: string
}

interface VoteWindow {
  id: number
  windowType: WindowType
  opensAt: string
  closesAt: string
  status: WindowStatus
  winnerNominationId: number | null
  noWinner: boolean
  coinOfMonthFor: string | null
  createdAt: string
  closedAt: string | null
  slate: SlateNomination[]
  totalBallots: number
}

function firstOfMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function twoWeeksFromNowISO(): string {
  const d = new Date(Date.now() + 14 * 86400000)
  // yyyy-MM-ddTHH:mm for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function countdownText(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now()
  if (ms <= 0) return "overdue"
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  if (days >= 2) return `${days} days left`
  if (hours >= 1) return `${hours}h left`
  return `${Math.ceil(ms / 60_000)}m left`
}

export default function VoteWindowsPage() {
  const [windows, setWindows] = useState<VoteWindow[]>([])
  const [pendingNoms, setPendingNoms] = useState<Nomination[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [windowType, setWindowType] = useState<WindowType>("coin_of_month")
  const [coinOfMonthFor, setCoinOfMonthFor] = useState(firstOfMonthISO())
  const [opensAt, setOpensAt] = useState(nowISO())
  const [closesAt, setClosesAt] = useState(twoWeeksFromNowISO())
  const [selectedNomIds, setSelectedNomIds] = useState<Set<number>>(new Set())

  // Action confirm state
  const [confirming, setConfirming] = useState<{ kind: "close" | "delete"; id: number } | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [windowsRes, nomsRes] = await Promise.all([
        fetch("/api/admin/vote-windows", { cache: "no-store" }),
        fetch("/api/admin/nominations?status=pending", { cache: "no-store" }),
      ])

      const windowsData = await windowsRes.json()
      if (windowsRes.ok) {
        setWindows(windowsData.windows ?? [])
      } else {
        setMsg({ kind: "error", text: windowsData.error || "Failed to load windows" })
      }

      // /api/admin/nominations doesn't exist yet (shipping in C8).
      // Fall back gracefully so this page works standalone.
      if (nomsRes.ok) {
        const nomsData = await nomsRes.json()
        setPendingNoms(nomsData.nominations ?? [])
      } else {
        setPendingNoms([])
      }
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Load failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Poll every 20s if there's an open window so tallies update live
  useEffect(() => {
    const hasOpen = windows.some(w => w.status === "open")
    if (!hasOpen) return
    const t = setInterval(() => {
      if (!saving) loadAll()
    }, 20_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows.length, windows.filter(w => w.status === "open").length])

  function toggleNomSelected(id: number) {
    const next = new Set(selectedNomIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedNomIds(next)
  }

  function resetForm() {
    setWindowType("coin_of_month")
    setCoinOfMonthFor(firstOfMonthISO())
    setOpensAt(nowISO())
    setClosesAt(twoWeeksFromNowISO())
    setSelectedNomIds(new Set())
  }

  async function handleOpen() {
    if (saving) return
    setSaving(true); setMsg(null)

    const payload: Record<string, unknown> = {
      windowType,
      opensAt: new Date(opensAt).toISOString(),
      closesAt: new Date(closesAt).toISOString(),
      nominationIds: Array.from(selectedNomIds),
    }
    if (windowType === "coin_of_month") {
      payload.coinOfMonthFor = coinOfMonthFor
    }

    try {
      const res = await fetch("/api/admin/vote-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Failed to open window" })
      } else {
        setMsg({ kind: "success", text: "Vote window opened" })
        setFormOpen(false)
        resetForm()
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleClose(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/vote-windows?action=close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Failed to close" })
      } else {
        const winner = data.result?.winner_id
        const noWinner = data.result?.no_winner
        setMsg({
          kind: "success",
          text: noWinner
            ? "Window closed · no winner (below threshold or no ballots)"
            : winner
              ? `Window closed · winner: nomination #${winner}`
              : "Window closed",
        })
        setConfirming(null)
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/vote-windows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Failed to delete" })
      } else {
        setMsg({ kind: "success", text: "Window deleted" })
        setConfirming(null)
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  // Filter pending noms by type to match the window being composed
  const filteredPending = pendingNoms.filter(n =>
    windowType === "coin_of_month"
      ? n.nominationType === "coin_of_month"
      : n.nominationType !== "coin_of_month"
  )

  const canSubmit =
    selectedNomIds.size >= 2 &&
    opensAt && closesAt &&
    (windowType !== "coin_of_month" || !!coinOfMonthFor)

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/record" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        The Record
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Vote Windows</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Open voting periods, monitor tallies, close windows.
          </p>
        </div>
        {!formOpen && (
          <Button onClick={() => { resetForm(); setFormOpen(true); setMsg(null) }}>
            <Plus className="w-4 h-4 mr-2" />
            Open new window
          </Button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 flex items-center gap-2 ${
          msg.kind === "error"
            ? "bg-red-500/10 border border-red-500/30 text-red-400"
            : "bg-green-500/10 border border-green-500/30 text-green-400"
        }`}>
          {msg.kind === "error" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="text-sm">{msg.text}</span>
        </div>
      )}

      {/* ─── Open-window composer ──────────────────────────────── */}
      {formOpen && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Open new vote window</h2>
              <button
                onClick={() => { setFormOpen(false); resetForm() }}
                className="text-gray-500 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <FieldLabel label="Window type">
              <div className="grid grid-cols-2 gap-2">
                {(["coin_of_month", "variable"] as WindowType[]).map(wt => (
                  <button
                    key={wt}
                    onClick={() => { setWindowType(wt); setSelectedNomIds(new Set()) }}
                    className={`py-2.5 rounded-md text-sm font-medium transition-colors border ${
                      windowType === wt
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-gray-900 border-gray-800 text-gray-500 hover:text-white hover:border-gray-700"
                    }`}
                  >
                    {wt === "coin_of_month" ? "Coin of the Month" : "Variable"}
                  </button>
                ))}
              </div>
            </FieldLabel>

            {windowType === "coin_of_month" && (
              <FieldLabel label="Coin of the Month date" sub="First of the month">
                <Input
                  type="date"
                  value={coinOfMonthFor}
                  onChange={e => setCoinOfMonthFor(e.target.value)}
                />
              </FieldLabel>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Opens at">
                <Input type="datetime-local" value={opensAt} onChange={e => setOpensAt(e.target.value)} />
              </FieldLabel>
              <FieldLabel label="Closes at">
                <Input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} />
              </FieldLabel>
            </div>

            {/* Nomination slate picker */}
            <FieldLabel
              label={`Attach nominations (${selectedNomIds.size} selected, min 2)`}
              sub={filteredPending.length === 0 ? "No matching pending nominations" : undefined}
            >
              {filteredPending.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-gray-500">
                      No pending {windowType === "coin_of_month" ? "Coin of the Month" : "celebration/funeral"} nominations.
                    </p>
                    <Link
                      href="/dashboard/record/nominations"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      View nominations →
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredPending.map(n => {
                    const selected = selectedNomIds.has(n.id)
                    return (
                      <button
                        key={n.id}
                        onClick={() => toggleNomSelected(n.id)}
                        className={`w-full text-left rounded-lg p-3 border transition-colors ${
                          selected
                            ? "bg-primary/10 border-primary/40"
                            : "bg-gray-900 border-gray-800 hover:border-gray-700"
                        }`}
                      >
                        <div className="flex items-baseline gap-2 mb-1">
                          <p className="font-semibold text-white text-sm">{n.projectName}</p>
                          <p className="text-xs text-gray-500 font-mono">${n.projectKey}</p>
                          <Badge className="text-[10px] bg-gray-800 text-gray-400 border-gray-700 ml-auto">
                            {n.endorsementCount} endorsements
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">{n.proposalText}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </FieldLabel>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleOpen} disabled={saving || !canSubmit}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Open window
              </Button>
              <Button variant="outline" onClick={() => { setFormOpen(false); resetForm() }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Window list ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : windows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Vote className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-400">No vote windows yet.</p>
            <p className="text-xs text-gray-500 mt-1">Open one to run your first Coin of the Month vote.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {windows.map(w => (
            <WindowCard
              key={w.id}
              window={w}
              confirming={confirming?.id === w.id ? confirming.kind : null}
              saving={saving}
              onRequestClose={() => setConfirming({ kind: "close", id: w.id })}
              onRequestDelete={() => setConfirming({ kind: "delete", id: w.id })}
              onConfirmClose={() => handleClose(w.id)}
              onConfirmDelete={() => handleDelete(w.id)}
              onCancelConfirm={() => setConfirming(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WindowCard({
  window: w,
  confirming,
  saving,
  onRequestClose,
  onRequestDelete,
  onConfirmClose,
  onConfirmDelete,
  onCancelConfirm,
}: {
  window: VoteWindow
  confirming: "close" | "delete" | null
  saving: boolean
  onRequestClose: () => void
  onRequestDelete: () => void
  onConfirmClose: () => void
  onConfirmDelete: () => void
  onCancelConfirm: () => void
}) {
  const winnerNom = w.winnerNominationId
    ? w.slate.find(n => n.id === w.winnerNominationId)
    : null

  const statusLabel =
    w.status === "open" ? "OPEN"
    : w.status === "closed" ? (w.noWinner ? "CLOSED · NO WINNER" : "CLOSED")
    : "CANCELLED"

  const statusColor =
    w.status === "open" ? "bg-green-500/10 text-green-400 border-green-500/20"
    : w.noWinner ? "bg-gray-500/10 text-gray-400 border-gray-500/20"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

  return (
    <Card>
      <CardContent className="p-5">
        {/* Confirm banner */}
        {confirming && (
          <div className="rounded-lg px-4 py-3 flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 mb-3">
            <p className="text-sm text-red-400">
              {confirming === "close" ? "Close this window now?" : "Delete this window?"}
              {confirming === "close" && (
                <span className="block text-xs text-red-300/70 mt-0.5">
                  Winner will be computed and locked. Irreversible.
                </span>
              )}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="destructive"
                size="sm"
                onClick={confirming === "close" ? onConfirmClose : onConfirmDelete}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, do it"}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelConfirm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={statusColor}>{statusLabel}</Badge>
              <p className="text-sm font-semibold text-white">
                {w.windowType === "coin_of_month" ? "Coin of the Month" : "Variable"}
                {w.coinOfMonthFor && (
                  <span className="text-gray-500 ml-1 font-normal">
                    · {new Date(w.coinOfMonthFor).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>Opens: {fmtDateTime(w.opensAt)}</span>
              <span>·</span>
              <span>Closes: {fmtDateTime(w.closesAt)}</span>
              {w.status === "open" && (
                <>
                  <span>·</span>
                  <span className="text-yellow-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {countdownText(w.closesAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {w.status === "open" && !confirming && (
              <button
                onClick={onRequestClose}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-yellow-400 hover:bg-yellow-500/10 transition-colors flex items-center gap-1.5"
                title="Close window now"
              >
                <XCircle className="w-3.5 h-3.5" />
                Close now
              </button>
            )}
            {w.totalBallots === 0 && !confirming && (
              <button
                onClick={onRequestDelete}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Delete (no ballots)"
                title="Delete — only allowed before any ballots are cast"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Slate with tallies */}
        <div className="space-y-2">
          {w.slate.map(n => {
            const isWinner = n.id === w.winnerNominationId
            const pct = w.totalBallots > 0 ? Math.round((n.voteCount / w.totalBallots) * 100) : 0
            return (
              <div
                key={n.id}
                className={`rounded-lg p-3 ${
                  isWinner ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-gray-900/50 border border-gray-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                      <p className="text-sm font-semibold text-white">{n.projectName}</p>
                      <p className="text-xs text-gray-500 font-mono">${n.projectKey}</p>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{n.proposalText}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold tabular-nums text-white">{n.voteCount}</p>
                    <p className="text-[10px] text-gray-500">{pct}%</p>
                  </div>
                </div>
                {w.totalBallots > 0 && (
                  <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%`, background: isWinner ? "#eab308" : "#6b7280" }}
                      className="h-full rounded-full transition-all duration-500"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>Total ballots: <span className="font-mono text-white">{w.totalBallots}</span></span>
          {w.closedAt && <span>Closed: {fmtDateTime(w.closedAt)}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function FieldLabel({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
        {sub && <span className="text-xs text-gray-600">{sub}</span>}
      </div>
      {children}
    </div>
  )
}
