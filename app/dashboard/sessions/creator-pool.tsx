"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, ShieldCheck } from "lucide-react"

/**
 * THE CREATOR POOL, and the checks that guard it.
 *
 * Doses are the public number and nothing here touches them. These settings
 * decide which of those Doses is QUALIFIED, and only a qualified one can ever
 * be worth money.
 *
 * None of this is shown anywhere in the app, on purpose. A farm that can read
 * the thresholds is a farm that can walk around them.
 */

interface Cfg {
  pool_pct: number
  min_payout_cents: number
  max_per_listener_per_day: number
  max_per_listener_per_case_per_day: number
  self_play_counts: boolean
  max_from_one_network_per_day: number
  burst_window_minutes: number
  burst_max: number
  monetization_on: boolean
}

interface Held {
  id: string
  reason: string | null
  at: string | null
}

const EMPTY: Cfg = {
  pool_pct: 20,
  min_payout_cents: 500,
  max_per_listener_per_day: 3,
  max_per_listener_per_case_per_day: 2,
  self_play_counts: false,
  max_from_one_network_per_day: 12,
  burst_window_minutes: 10,
  burst_max: 8,
  monetization_on: false,
}

export function CreatorPool() {
  const [c, setC] = useState<Cfg>(EMPTY)
  const [counts, setCounts] = useState({ qualified: 0, pending: 0, invalid: 0 })
  const [held, setHeld] = useState<Held[]>([])
  const [present, setPresent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(() => {
    fetch("/api/admin/creator", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the creator settings"))))
      .then((d) => {
        if (d.config) setC(d.config as Cfg)
        if (d.counts) setCounts(d.counts)
        setHeld(Array.isArray(d.held) ? d.held : [])
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
      const r = await fetch("/api/admin/creator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      if (d.config) setC(d.config as Cfg)
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

  const judge = async (id: string, state: string) => {
    setBusy(id)
    try {
      await fetch("/api/admin/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: id, state }),
      })
      load()
    } catch {}
    setBusy("")
  }

  const toggleMon = async () => {
    const want = !c.monetization_on
    setC((x) => ({ ...x, monetization_on: want }))
    const ok = await patch("mon", { monetization_on: want })
    if (!ok) setC((x) => ({ ...x, monetization_on: !want }))
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the creator settings
      </p>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Creator pool
        </CardTitle>
        <CardDescription>
          Doses are the public number and nothing here touches them. These decide which of those Doses
          counts as qualified, and only a qualified one can ever be worth money. None of it is shown in
          the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!present ? (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>The creator_config row is not there yet. Run 131_qualified_doses.sql, then reload.</span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-800 p-3">
            <p className="text-[11px] text-gray-500">QUALIFIED</p>
            <p className="text-2xl font-semibold text-green-400">{counts.qualified}</p>
          </div>
          <div className="rounded-lg border border-gray-800 p-3">
            <p className="text-[11px] text-gray-500">HELD</p>
            <p className="text-2xl font-semibold text-yellow-400">{counts.pending}</p>
          </div>
          <div className="rounded-lg border border-gray-800 p-3">
            <p className="text-[11px] text-gray-500">INVALID</p>
            <p className="text-2xl font-semibold text-red-400">{counts.invalid}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMon}
          disabled={busy === "mon"}
          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${
            c.monetization_on ? "border-green-700 bg-green-950/40" : "border-gray-700 bg-gray-900/60"
          }`}
        >
          <span>
            <span className={`block text-sm font-semibold ${c.monetization_on ? "text-green-400" : "text-gray-400"}`}>
              {c.monetization_on ? "The clinic is paying creators" : "The clinic is not paying creators yet"}
            </span>
            <span className="mt-1 block text-xs text-gray-500">
              Off means Doses are still counted and judged, and the app says so plainly rather than
              promising anything. Turn it on only when there is money to share.
            </span>
          </span>
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Pool share of Admission revenue, %</label>
            <Input type="number" value={c.pool_pct} onChange={(e) => setC({ ...c, pool_pct: Number(e.target.value) })} />
            <p className="text-[11px] text-gray-600 mt-1">Never printed in the app.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Minimum payout, cents</label>
            <Input
              type="number"
              value={c.min_payout_cents}
              onChange={(e) => setC({ ...c, min_payout_cents: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Per listener, per case, a day</label>
            <Input
              type="number"
              value={c.max_per_listener_per_case_per_day}
              onChange={(e) => setC({ ...c, max_per_listener_per_case_per_day: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Per listener, all cases, a day</label>
            <Input
              type="number"
              value={c.max_per_listener_per_day}
              onChange={(e) => setC({ ...c, max_per_listener_per_day: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Burst window, minutes</label>
            <Input
              type="number"
              value={c.burst_window_minutes}
              onChange={(e) => setC({ ...c, burst_window_minutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Plays in that window before holding</label>
            <Input type="number" value={c.burst_max} onChange={(e) => setC({ ...c, burst_max: Number(e.target.value) })} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setC({ ...c, self_play_counts: !c.self_play_counts })}
          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left ${
            c.self_play_counts ? "border-yellow-800 bg-yellow-950/30" : "border-gray-800"
          }`}
        >
          <span className={`text-sm font-semibold ${c.self_play_counts ? "text-yellow-400" : "text-gray-400"}`}>
            {c.self_play_counts
              ? "A patient playing their own case counts"
              : "A patient playing their own case does not count"}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            patch("numbers", {
              pool_pct: c.pool_pct,
              min_payout_cents: c.min_payout_cents,
              max_per_listener_per_day: c.max_per_listener_per_day,
              max_per_listener_per_case_per_day: c.max_per_listener_per_case_per_day,
              max_from_one_network_per_day: c.max_from_one_network_per_day,
              burst_window_minutes: c.burst_window_minutes,
              burst_max: c.burst_max,
              self_play_counts: c.self_play_counts,
            })
          }
          disabled={busy === "numbers"}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {busy === "numbers" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "numbers" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          Save the rules
        </button>

        {held.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Held for review. Nothing here is paid and nothing here is thrown away.
            </p>
            {held.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 p-2.5">
                <span className="text-[11px] text-gray-500">{h.reason ?? "held"}</span>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={busy === h.id}
                    onClick={() => judge(h.id, "qualified")}
                    className="rounded border border-gray-700 px-2 py-1 text-[11px] text-green-400 hover:border-green-700"
                  >
                    Let it count
                  </button>
                  <button
                    type="button"
                    disabled={busy === h.id}
                    onClick={() => judge(h.id, "invalid")}
                    className="rounded border border-gray-700 px-2 py-1 text-[11px] text-red-400 hover:border-red-900"
                  >
                    Void it
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
