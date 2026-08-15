"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Check, Copy, Flag, Clock, Send, AlertCircle } from "lucide-react"

/**
 * THE QUEUE.
 *
 * Every paid case, newest first, with the patient's own words readable and a
 * copy button that hands them over ready to write from. The five stages are
 * the same five the patient is watching, so pressing one here moves their
 * countdown screen.
 *
 * A case is released by attaching a track that already exists in Tracks. The
 * song is uploaded there like every other song in the building, which is why
 * there is no second uploader on this page.
 */

interface CaseRow {
  id: string
  patient_no: number | null
  therapist_id: number
  therapist_name: string
  condition: string
  story: string
  language: string
  status: string
  stage: string
  price_cents: number
  due_at: string | null
  title: string | null
  track_id: number | null
  flagged: boolean
  flag_reason: string | null
  created_at: string
  paid_at: string | null
  released_at: string | null
}

const STAGES = [
  { key: "received", label: "Received" },
  { key: "examining", label: "Examining" },
  { key: "writing", label: "Writing" },
  { key: "production", label: "Production" },
  { key: "ready", label: "Ready" },
]

const FILTERS = [
  { key: "live", label: "In the building" },
  { key: "flagged", label: "Flagged" },
  { key: "released", label: "Delivered" },
  { key: "unpaid", label: "Never paid" },
  { key: "all", label: "Everything" },
]

function since(iso: string | null): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function due(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: "no clock", late: false }
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: "overdue", late: true }
  const m = Math.floor(ms / 60000)
  if (m < 60) return { text: `${m}m left`, late: m < 15 }
  return { text: `${Math.floor(m / 60)}h ${m % 60}m left`, late: false }
}

export function CaseQueue() {
  const [rows, setRows] = useState<CaseRow[]>([])
  const [filter, setFilter] = useState("live")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { title: string; track: string }>>({})

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/sessions/cases?filter=${filter}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the queue"))))
      .then((d) => setRows(Array.isArray(d.cases) ? d.cases : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(load, [load])

  const act = async (tag: string, payload: Record<string, unknown>) => {
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/sessions/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      load()
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally {
      setBusy("")
    }
  }

  const d = (id: string) => draft[id] ?? { title: "", track: "" }
  const setD = (id: string, part: Partial<{ title: string; track: string }>) =>
    setDraft((x) => ({ ...x, [id]: { ...d(id), ...part } }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>The queue</CardTitle>
        <CardDescription>
          Every case that has been paid for. Moving a stage moves the screen the patient is watching, so
          only move one when it is true.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                filter === f.key ? "border-yellow-600 bg-yellow-950/40 text-yellow-400" : "border-gray-700 text-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading the queue
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-600">
            Nothing here. When somebody books, the case lands in this list.
          </p>
        ) : (
          rows.map((c) => {
            const clock = due(c.due_at)
            return (
              <div
                key={c.id}
                className={`rounded-lg border p-3 space-y-3 ${
                  c.flagged ? "border-red-900 bg-red-950/20" : "border-gray-800"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white">PATIENT #{c.patient_no ?? "0000"}</span>
                  <span className="text-gray-500">{c.therapist_name}</span>
                  <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                    {c.condition}
                  </span>
                  <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                    {c.language.toUpperCase()}
                  </span>
                  <span className="text-gray-600">paid {since(c.paid_at)}</span>
                  <span className={`ml-auto flex items-center gap-1 ${clock.late ? "text-red-400" : "text-gray-500"}`}>
                    <Clock className="w-3 h-3" /> {clock.text}
                  </span>
                </div>

                {c.flagged ? (
                  <p className="rounded border border-red-900 bg-red-950/40 px-2 py-1.5 text-xs text-red-300">
                    FLAGGED. This case stops here and gets an answer from a person, not a song.
                    {c.flag_reason ? ` ${c.flag_reason}` : ""}
                  </p>
                ) : null}

                <div className="rounded-lg border border-gray-800 bg-black/40 p-3">
                  <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-gray-300">
                    {c.story}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.story)
                      setCopied(c.id)
                      setTimeout(() => setCopied(null), 1600)
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  >
                    {copied === c.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === c.id ? "Copied" : "Copy their words"}
                  </button>
                </div>

                {c.status !== "released" && c.status !== "refunded" ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          disabled={busy === `stage-${c.id}` || c.flagged}
                          onClick={() => act(`stage-${c.id}`, { what: "stage", id: c.id, stage: s.key })}
                          className={`rounded border px-2.5 py-1 text-[11px] disabled:opacity-50 ${
                            c.stage === s.key
                              ? "border-green-600 bg-green-950/40 text-green-400"
                              : "border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                      <Input
                        placeholder="Title on the prescription"
                        value={d(c.id).title || c.title || ""}
                        onChange={(e) => setD(c.id, { title: e.target.value })}
                      />
                      <Input
                        placeholder="Track id"
                        type="number"
                        value={d(c.id).track || (c.track_id ? String(c.track_id) : "")}
                        onChange={(e) => setD(c.id, { track: e.target.value })}
                      />
                      <button
                        type="button"
                        disabled={busy === `rel-${c.id}` || c.flagged}
                        onClick={() =>
                          act(`rel-${c.id}`, {
                            what: "release",
                            id: c.id,
                            title: d(c.id).title || c.title || "",
                            track_id: Number(d(c.id).track || c.track_id || 0),
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
                      >
                        {busy === `rel-${c.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Release
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600">
                      Upload the finished song in Tracks first, then put its id here. Releasing puts it on
                      the patient's own page straight away.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === `ext-${c.id}`}
                        onClick={() => act(`ext-${c.id}`, { what: "extend", id: c.id, minutes: 60 })}
                        className="rounded border border-gray-700 px-2.5 py-1 text-[11px] text-gray-400 hover:border-gray-500"
                      >
                        Give it another hour
                      </button>
                      <button
                        type="button"
                        disabled={busy === `flag-${c.id}`}
                        onClick={() => {
                          const reason = c.flagged ? "" : prompt("Why is this one being stopped?") || ""
                          if (!c.flagged && !reason) return
                          act(`flag-${c.id}`, { what: "flag", id: c.id, on: !c.flagged, reason })
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[11px] text-gray-400 hover:border-red-800 hover:text-red-400"
                      >
                        <Flag className="w-3 h-3" />
                        {c.flagged ? "Unflag" : "Stop this one"}
                      </button>
                      <button
                        type="button"
                        disabled={busy === `ref-${c.id}`}
                        onClick={() => {
                          const reason = prompt("Refund by hand. Why can the clinic not deliver this one?") || ""
                          if (!reason) return
                          act(`ref-${c.id}`, { what: "refund", id: c.id, reason })
                        }}
                        className="ml-auto rounded border border-gray-800 px-2.5 py-1 text-[11px] text-gray-600 hover:border-red-900 hover:text-red-400"
                      >
                        Refund by hand
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">
                    {c.status === "released"
                      ? `Delivered ${since(c.released_at)} as "${c.title ?? ""}".`
                      : "Refunded by hand."}
                  </p>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
