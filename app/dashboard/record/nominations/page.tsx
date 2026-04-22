"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ClipboardList, Loader2, ArrowLeft, AlertTriangle, CheckCircle2,
  XCircle, Trash2, Users, Clock,
} from "lucide-react"

/**
 * /dashboard/record/nominations
 *
 * Review member-proposed Record entries. The admin decides which
 * nominations get attached to vote windows and which get rejected.
 *
 * Status lifecycle:
 *   pending   — just submitted, awaiting admin review
 *   voting    — attached to an open vote window
 *   won       — won the vote (will be composed into a Record entry)
 *   lost      — lost the vote
 *   expired   — never got attached to a window within 30 days (DB
 *               housekeeping closes these off)
 *   rejected  — admin rejected (spam or off-topic)
 *
 * Actions:
 *   pending → reject (soft, keeps history)
 *   pending → hard-delete (only for obvious junk/tests)
 *
 * Attaching a pending nom to a vote window happens on the vote
 * windows page, not here — the flow there needs to pick a slate all
 * at once and we don't want two places that can change status.
 */

type NomStatus = "pending" | "voting" | "won" | "lost" | "expired" | "rejected"
type NomType = "celebration" | "funeral" | "coin_of_month"

interface Nomination {
  id: number
  proposerTelegramId: string | null
  projectName: string
  projectKey: string
  nominationType: NomType
  proposalText: string
  voteWindowId: number | null
  status: NomStatus
  endorsementCount: number
  createdAt: string
  updatedAt: string
}

const STATUS_META: Record<NomStatus, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  voting:   { label: "Voting",   color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  won:      { label: "Won",      color: "bg-green-500/10 text-green-400 border-green-500/20" },
  lost:     { label: "Lost",     color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  expired:  { label: "Expired",  color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-400 border-red-500/20" },
}

const TYPE_META: Record<NomType, { label: string; color: string }> = {
  celebration:   { label: "Celebration",       color: "text-green-400" },
  funeral:       { label: "Graveyard",         color: "text-gray-400" },
  coin_of_month: { label: "Coin of the Month", color: "text-yellow-400" },
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d ago`
  if (hours >= 1) return `${hours}h ago`
  const mins = Math.floor(ms / 60_000)
  return mins >= 1 ? `${mins}m ago` : "just now"
}

export default function NominationsPage() {
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  // Filter state
  const [statusFilter, setStatusFilter] = useState<NomStatus | "all">("pending")

  // Confirm state
  const [confirming, setConfirming] = useState<{ kind: "reject" | "delete"; id: number } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const query = statusFilter === "all" ? "" : `?status=${statusFilter}`
      const res = await fetch(`/api/admin/nominations${query}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Failed to load" })
      } else {
        setNominations(data.nominations ?? [])
      }
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Load failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter])

  async function handleReject(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/nominations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "rejected" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Reject failed" })
      } else {
        setMsg({ kind: "success", text: "Nomination rejected" })
        setConfirming(null)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/nominations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Delete failed" })
      } else {
        setMsg({ kind: "success", text: "Nomination deleted" })
        setConfirming(null)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  // Count by status for the filter pills
  const statusCounts = {
    pending: nominations.filter(n => n.status === "pending").length,
    voting:  nominations.filter(n => n.status === "voting").length,
    other:   nominations.length,
  }

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/record" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        The Record
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Nominations</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Review member-proposed entries. Reject spam. Attach-to-vote happens on the Vote Windows page.
        </p>
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

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <FilterPill
          label="Pending"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
        <FilterPill
          label="Voting"
          active={statusFilter === "voting"}
          onClick={() => setStatusFilter("voting")}
        />
        <FilterPill
          label="Won"
          active={statusFilter === "won"}
          onClick={() => setStatusFilter("won")}
        />
        <FilterPill
          label="Lost"
          active={statusFilter === "lost"}
          onClick={() => setStatusFilter("lost")}
        />
        <FilterPill
          label="Expired"
          active={statusFilter === "expired"}
          onClick={() => setStatusFilter("expired")}
        />
        <FilterPill
          label="Rejected"
          active={statusFilter === "rejected"}
          onClick={() => setStatusFilter("rejected")}
        />
        <div className="h-4 w-px bg-gray-800 mx-1" />
        <FilterPill
          label="All"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : nominations.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-400">
              {statusFilter === "all"
                ? "No nominations yet."
                : `No ${STATUS_META[statusFilter as NomStatus].label.toLowerCase()} nominations.`}
            </p>
            {statusFilter === "pending" && (
              <p className="text-xs text-gray-500 mt-1">
                Members with 4+ completed streaks can submit from the main app.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {nominations.map(n => (
            <NomCard
              key={n.id}
              nom={n}
              confirming={confirming?.id === n.id ? confirming.kind : null}
              saving={saving}
              onRequestReject={() => setConfirming({ kind: "reject", id: n.id })}
              onRequestDelete={() => setConfirming({ kind: "delete", id: n.id })}
              onConfirmReject={() => handleReject(n.id)}
              onConfirmDelete={() => handleDelete(n.id)}
              onCancelConfirm={() => setConfirming(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-primary/20 text-primary border border-primary/40"
          : "bg-gray-900 text-gray-400 border border-gray-800 hover:text-white hover:border-gray-700"
      }`}
    >
      {label}
    </button>
  )
}

function NomCard({
  nom: n, confirming, saving,
  onRequestReject, onRequestDelete,
  onConfirmReject, onConfirmDelete,
  onCancelConfirm,
}: {
  nom: Nomination
  confirming: "reject" | "delete" | null
  saving: boolean
  onRequestReject: () => void
  onRequestDelete: () => void
  onConfirmReject: () => void
  onConfirmDelete: () => void
  onCancelConfirm: () => void
}) {
  const statusMeta = STATUS_META[n.status]
  const typeMeta = TYPE_META[n.nominationType]

  const canReject = n.status === "pending" && !n.voteWindowId
  const canDelete = n.status === "pending" && !n.voteWindowId

  return (
    <Card className={n.status === "rejected" || n.status === "expired" ? "opacity-60" : ""}>
      <CardContent className="p-4">
        {confirming && (
          <div className="rounded-lg px-4 py-3 flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 mb-3">
            <p className="text-sm text-red-400">
              {confirming === "reject"
                ? `Reject "${n.projectName}"? Keeps history, member sees it was declined.`
                : `Permanently delete "${n.projectName}"? No record kept.`}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="destructive"
                size="sm"
                onClick={confirming === "reject" ? onConfirmReject : onConfirmDelete}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelConfirm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge className={statusMeta.color}>{statusMeta.label}</Badge>
              <p className="text-sm font-semibold text-white">{n.projectName}</p>
              <p className="text-xs text-gray-500 font-mono">${n.projectKey}</p>
              <span className={`text-[11px] font-medium ${typeMeta.color}`}>· {typeMeta.label}</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">{n.proposalText}</p>

            <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {n.endorsementCount} {n.endorsementCount === 1 ? "endorsement" : "endorsements"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeSince(n.createdAt)}
              </span>
              {n.voteWindowId && (
                <Link
                  href="/dashboard/record/vote-windows"
                  className="text-primary hover:underline"
                >
                  Window #{n.voteWindowId} →
                </Link>
              )}
              {n.proposerTelegramId && (
                <span className="font-mono">
                  by tg:{n.proposerTelegramId.slice(0, 8)}{n.proposerTelegramId.length > 8 ? "…" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          {!confirming && (canReject || canDelete) && (
            <div className="flex items-center gap-1 shrink-0">
              {canReject && (
                <button
                  onClick={onRequestReject}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-yellow-400 hover:bg-yellow-500/10 transition-colors flex items-center gap-1.5"
                  title="Reject"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              )}
              {canDelete && (
                <button
                  onClick={onRequestDelete}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Delete"
                  title="Permanently delete (junk/test only)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-800/60 flex items-center justify-between text-[10px] text-gray-600">
          <span>Created: {fmtDate(n.createdAt)}</span>
          {n.updatedAt !== n.createdAt && <span>Updated: {fmtDate(n.updatedAt)}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
