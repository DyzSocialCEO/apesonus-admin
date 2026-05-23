"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Gauge, Plus, Pencil, Trash2, Loader2, X, Save, Calendar,
  Archive, Inbox, AlertCircle, Lock,
} from "lucide-react"

/**
 * /dashboard/sentimetre — Vibe Check Tier 2 question manager.
 *
 * Compose new questions, schedule them for a UTC date, view the bank
 * of unscheduled questions, see what's running today + the upcoming
 * week, browse the archive of past questions with their final results.
 *
 * Edit lock: a question whose text or options are edited becomes
 * impossible once ANY response has been recorded against it. Schedule
 * date can still change for an unvoted question. Backend enforces this
 * at /api/admin/sentimetre/[id]; UI mirrors the rule visibly.
 *
 * Schedule rule: at most one question per UTC date (partial UNIQUE
 * index on sentimetre_questions.active_date from migration 051). The
 * compose form rejects a date that's already taken; the API also
 * returns 409 if you try to schedule a collision.
 */

interface Question {
  id: string
  question: string
  options: string[]
  active_date: string | null
  created_at: string
  updated_at: string
  response_count: number
  aggregate: [number, number, number, number]
}

interface ListPayload {
  scheduled: Question[]
  bank: Question[]
  archive: Question[]
  today: string
}

const EMPTY_OPTIONS = ["", "", "", ""] as const

function todayUtc(): string {
  return new Date().toISOString().split("T")[0]
}

function plusDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  })
}

export default function SentimetreAdminPage() {
  const [data, setData] = useState<ListPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [composing, setComposing] = useState(false)
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Compose form state
  const [text, setText] = useState("")
  const [options, setOptions] = useState<string[]>([...EMPTY_OPTIONS])
  const [activeDate, setActiveDate] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/sentimetre")
      if (res.ok) {
        const j = (await res.json()) as ListPayload
        setData(j)
      }
    } catch {
      // swallow
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setText("")
    setOptions([...EMPTY_OPTIONS])
    setActiveDate("")
    setEditingId(null)
    setComposing(false)
  }

  const startEdit = (q: Question) => {
    setEditingId(q.id)
    setText(q.question)
    setOptions([...q.options, "", "", "", ""].slice(0, 4))
    setActiveDate(q.active_date || "")
    setComposing(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const validateForm = (): string | null => {
    const q = text.trim()
    if (q.length < 1 || q.length > 280) return "Question must be 1-280 characters."
    for (let i = 0; i < 4; i++) {
      const o = options[i]?.trim() || ""
      if (!o) return `Option ${String.fromCharCode(65 + i)} is required.`
      if (o.length > 200) return `Option ${String.fromCharCode(65 + i)} is too long (max 200).`
    }
    if (activeDate && !/^\d{4}-\d{2}-\d{2}$/.test(activeDate)) {
      return "Date must be YYYY-MM-DD."
    }
    return null
  }

  const handleSave = async () => {
    setMsg(null)
    const err = validateForm()
    if (err) {
      setMsg({ kind: "error", text: err })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        question: text.trim(),
        options: options.map((o) => o.trim()),
      }
      // For create: only include active_date if user picked one.
      // For edit: always include active_date so unscheduling (empty) works.
      if (editingId) {
        payload.active_date = activeDate || null
      } else if (activeDate) {
        payload.active_date = activeDate
      }

      const url = editingId
        ? `/api/admin/sentimetre/${editingId}`
        : "/api/admin/sentimetre"
      const method = editingId ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: "error", text: j.error || "Save failed." })
      } else {
        setMsg({
          kind: "success",
          text: editingId ? "Question updated." : "Question created.",
        })
        resetForm()
        await load()
      }
    } catch {
      setMsg({ kind: "error", text: "Network error." })
    } finally {
      setSaving(false)
    }
  }

  const handleSchedule = async (id: string, date: string | null) => {
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/sentimetre/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_date: date }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: "error", text: j.error || "Schedule failed." })
      } else {
        setMsg({
          kind: "success",
          text: date ? `Scheduled for ${formatDate(date)}.` : "Unscheduled.",
        })
        await load()
      }
    } catch {
      setMsg({ kind: "error", text: "Network error." })
    }
  }

  const handleDelete = async (id: string, question: string) => {
    if (!confirm(`Delete this question?\n\n"${question.slice(0, 80)}${question.length > 80 ? "…" : ""}"`)) return
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/sentimetre/${id}`, {
        method: "DELETE",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: "error", text: j.error || "Delete failed." })
      } else {
        setMsg({ kind: "success", text: "Question deleted." })
        await load()
      }
    } catch {
      setMsg({ kind: "error", text: "Network error." })
    }
  }

  const editingQuestion = editingId
    ? [...(data?.scheduled || []), ...(data?.bank || []), ...(data?.archive || [])]
        .find((q) => q.id === editingId)
    : null
  const editLocked = !!editingQuestion && editingQuestion.response_count > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Gauge className="w-6 h-6 text-primary" />
            Sentimetre
          </h1>
          <p className="text-gray-400">
            Daily community questions. Schedule one per UTC date.
          </p>
        </div>
        {!composing && (
          <Button onClick={() => setComposing(true)} className="bg-primary text-black hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1.5" /> New question
          </Button>
        )}
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
            msg.kind === "error"
              ? "bg-red-500/10 text-red-400"
              : "bg-green-500/10 text-green-400"
          }`}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{msg.text}</span>
        </div>
      )}

      {composing && (
        <Card className="bg-gray-900 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit question" : "Compose new question"}
              </h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {editLocked && (
              <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-300 text-xs flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  This question already has {editingQuestion?.response_count} response{editingQuestion?.response_count === 1 ? "" : "s"}. Text and options are locked. You can still change or clear the schedule.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Question <span className="text-gray-600">({text.length}/280)</span>
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 280))}
                disabled={editLocked}
                placeholder="What is your read on the market right now?"
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Option {String.fromCharCode(65 + i)}
                  </label>
                  <Input
                    value={options[i] || ""}
                    onChange={(e) => {
                      const next = [...options]
                      next[i] = e.target.value.slice(0, 200)
                      setOptions(next)
                    }}
                    disabled={editLocked}
                    placeholder={`Answer ${String.fromCharCode(65 + i)}`}
                    className="disabled:opacity-50"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Schedule (UTC date) {editingId ? "— clear to unschedule" : "— leave empty to save to bank"}
              </label>
              <input
                type="date"
                value={activeDate}
                min={todayUtc()}
                onChange={(e) => setActiveDate(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-[11px] text-gray-600 mt-1.5">
                Questions go live at 00:00 UTC on the selected date.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-black hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                {editingId ? "Save changes" : "Save question"}
              </Button>
              <Button onClick={resetForm} variant="secondary">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Section
        icon={Calendar}
        title="Today + Upcoming"
        emptyText="No questions scheduled. Compose one above."
        questions={data?.scheduled || []}
        loading={loading}
        today={data?.today || todayUtc()}
        onEdit={startEdit}
        onUnschedule={(q) => handleSchedule(q.id, null)}
        onDelete={(q) => handleDelete(q.id, q.question)}
        showResponseCount
      />

      <Section
        icon={Inbox}
        title="Bank — unscheduled"
        emptyText="No questions in the bank."
        questions={data?.bank || []}
        loading={loading}
        today={data?.today || todayUtc()}
        onEdit={startEdit}
        onDelete={(q) => handleDelete(q.id, q.question)}
      />

      <Section
        icon={Archive}
        title="Archive"
        emptyText="No past questions yet."
        questions={data?.archive || []}
        loading={loading}
        today={data?.today || todayUtc()}
        showResponseCount
        showAggregate
        readOnly
      />
    </div>
  )
}

// ──────────────────────────────────────────────
// SECTION COMPONENT
// ──────────────────────────────────────────────

function Section({
  icon: Icon, title, emptyText, questions, loading, today,
  onEdit, onUnschedule, onDelete,
  showResponseCount = false, showAggregate = false, readOnly = false,
}: {
  icon: typeof Calendar
  title: string
  emptyText: string
  questions: Question[]
  loading: boolean
  today: string
  onEdit?: (q: Question) => void
  onUnschedule?: (q: Question) => void
  onDelete?: (q: Question) => void
  showResponseCount?: boolean
  showAggregate?: boolean
  readOnly?: boolean
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon className="w-5 h-5 text-gray-400" />
          {title}
          <span className="text-xs font-normal text-gray-500">({questions.length})</span>
        </h2>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : questions.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                today={today}
                onEdit={onEdit}
                onUnschedule={onUnschedule}
                onDelete={onDelete}
                showResponseCount={showResponseCount}
                showAggregate={showAggregate}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuestionRow({
  q, today, onEdit, onUnschedule, onDelete,
  showResponseCount, showAggregate, readOnly,
}: {
  q: Question
  today: string
  onEdit?: (q: Question) => void
  onUnschedule?: (q: Question) => void
  onDelete?: (q: Question) => void
  showResponseCount?: boolean
  showAggregate?: boolean
  readOnly?: boolean
}) {
  const isToday = q.active_date === today
  const total = q.aggregate.reduce((a, b) => a + b, 0)

  return (
    <div
      className={`p-3 rounded-lg border ${
        isToday
          ? "bg-primary/5 border-primary/40"
          : "bg-gray-800/40 border-gray-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {q.active_date && (
              <Badge className={`text-[10px] border-0 ${
                isToday
                  ? "bg-primary/20 text-primary"
                  : "bg-gray-700 text-gray-300"
              }`}>
                {isToday ? "LIVE TODAY" : formatDate(q.active_date)}
              </Badge>
            )}
            {showResponseCount && (
              <span className="text-[11px] text-gray-500">
                {q.response_count} response{q.response_count === 1 ? "" : "s"}
              </span>
            )}
            {q.response_count > 0 && !readOnly && (
              <span className="text-[11px] text-yellow-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> text locked
              </span>
            )}
          </div>

          <p className="text-white text-sm font-medium mb-2">{q.question}</p>

          {showAggregate && total > 0 ? (
            <div className="space-y-1 mt-2">
              {q.options.map((opt, i) => {
                const count = q.aggregate[i] || 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={i} className="relative bg-gray-900 rounded px-2 py-1 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/15"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between text-xs">
                      <span className="text-gray-300">
                        <span className="text-primary font-bold mr-1.5">{String.fromCharCode(65 + i)}</span>
                        {opt}
                      </span>
                      <span className="text-gray-400 font-mono">{pct}% · {count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5">
              {q.options.map((opt, i) => (
                <div key={i} className="text-xs text-gray-400">
                  <span className="text-primary font-bold mr-1.5">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(q)}
                className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onUnschedule && q.active_date && q.response_count === 0 && (
              <button
                onClick={() => onUnschedule(q)}
                className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"
                title="Move back to bank"
              >
                <Inbox className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && q.response_count === 0 && (
              <button
                onClick={() => onDelete(q)}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
