"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Plus, Trash2 } from "lucide-react"

/**
 * ADMISSION.
 *
 * The only thing the clinic sells. Listening is free, and this buys a window
 * of time with private sessions in it, plus the right to put a Prescription on
 * the record.
 *
 * Editing here changes what the app offers AND what the database will price a
 * purchase at, because both read this one list.
 */

interface Tier {
  key: string
  name: string
  days: number
  sessions: number
  cents: number
  active: boolean
}

export function Admission() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [publishNeeds, setPublishNeeds] = useState(true)
  const [admitted, setAdmitted] = useState(0)
  const [outstanding, setOutstanding] = useState(0)
  const [present, setPresent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(() => {
    fetch("/api/admin/admission", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read Admission"))))
      .then((d) => {
        setTiers(Array.isArray(d.tiers) ? d.tiers : [])
        setPublishNeeds(d.publishNeedsAdmission !== false)
        setAdmitted(Number(d.admitted ?? 0))
        setOutstanding(Number(d.sessionsOutstanding ?? 0))
        setPresent(d.present !== false)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const patch = async (tag: string, payload: Record<string, unknown>) => {
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/admission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      if (Array.isArray(d.tiers)) setTiers(d.tiers)
      if ("publishNeedsAdmission" in d) setPublishNeeds(d.publishNeedsAdmission !== false)
      setSaved(tag)
      setTimeout(() => setSaved(""), 1800)
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally {
      setBusy("")
    }
  }

  const set = (i: number, part: Partial<Tier>) =>
    setTiers((list) => list.map((t, n) => (n === i ? { ...t, ...part } : t)))

  const togglePublish = async () => {
    const want = !publishNeeds
    setPublishNeeds(want)
    const ok = await patch("pub", { publish_needs_admission: want })
    if (!ok) setPublishNeeds(!want)
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading Admission
      </p>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admission</CardTitle>
        <CardDescription>
          The only thing the clinic sells. Each one is a window of days with a number of private
          sessions in it. Unused sessions do not roll over, and one session a day still applies
          whatever anybody holds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!present ? (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>The admission_config row is not there yet. Run 125_admission.sql, then reload.</span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <p className="text-xs text-gray-500">
          {admitted} {admitted === 1 ? "patient is" : "patients are"} inside a window right now, holding{" "}
          {outstanding} unused {outstanding === 1 ? "session" : "sessions"} between them. That is what the
          desk owes.
        </p>

        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div
              key={t.key || i}
              className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-[110px_1fr_80px_90px_100px_auto] sm:items-end ${
                t.active ? "border-gray-800" : "border-gray-900 opacity-60"
              }`}
            >
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Key</label>
                <Input value={t.key} onChange={(e) => set(i, { key: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Name in the app</label>
                <Input value={t.name} onChange={(e) => set(i, { name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Days</label>
                <Input type="number" value={t.days} onChange={(e) => set(i, { days: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Sessions</label>
                <Input
                  type="number"
                  value={t.sessions}
                  onChange={(e) => set(i, { sessions: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Price, cents</label>
                <Input type="number" value={t.cents} onChange={(e) => set(i, { cents: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set(i, { active: !t.active })}
                  className={`rounded border px-2 py-1.5 text-[11px] ${
                    t.active ? "border-green-700 text-green-400" : "border-gray-700 text-gray-500"
                  }`}
                >
                  {t.active ? "On offer" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => setTiers((list) => list.filter((_, n) => n !== i))}
                  className="rounded border border-gray-800 p-1.5 text-gray-600 hover:border-red-900 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-gray-600 sm:col-span-6">
                ${(t.cents / 100).toFixed(2)} for {t.sessions} {t.sessions === 1 ? "session" : "sessions"} over{" "}
                {t.days} days, which is ${(t.cents / 100 / Math.max(1, t.sessions)).toFixed(2)} a session.
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setTiers((list) => [
                ...list,
                { key: `a${list.length + 1}`, name: "NEW ADMISSION", days: 7, sessions: 1, cents: 199, active: false },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500"
          >
            <Plus className="w-3.5 h-3.5" /> Add one
          </button>

          <button
            type="button"
            onClick={() => patch("tiers", { tiers })}
            disabled={busy === "tiers"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "tiers" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "tiers" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the Admissions
          </button>
        </div>

        <button
          type="button"
          onClick={togglePublish}
          disabled={busy === "pub"}
          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${
            publishNeeds ? "border-violet-800 bg-violet-950/30" : "border-gray-700 bg-gray-900/60"
          }`}
        >
          <span>
            <span className={`block text-sm font-semibold ${publishNeeds ? "text-violet-300" : "text-gray-400"}`}>
              {publishNeeds
                ? "Putting a case on the record needs an Admission"
                : "Anybody can put a case on the record"}
            </span>
            <span className="mt-1 block text-xs text-gray-500">
              Taking one down never needs one. A case already public stays public when an Admission runs
              out.
            </span>
          </span>
        </button>
      </CardContent>
    </Card>
  )
}
