"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Stethoscope } from "lucide-react"
import { CaseQueue } from "./case-queue"
import { Voices } from "./voices"
import { Admission } from "./admission"
import { CreatorPool } from "./creator-pool"

/**
 * /dashboard/sessions, THE SESSIONS desk.
 *
 * The numbers a private session runs on, and under them the queue of cases
 * waiting to be written. One desk for the whole thing rather than three.
 *
 * The open switch saves the instant it is pressed. Everything else is typed,
 * so it saves behind its own button.
 */

interface Config {
  price_cents: number
  capacity_per_day: number
  per_patient_per_day: number
  estimate_minutes: number
  booking_open: boolean
}

const EMPTY: Config = {
  price_cents: 200,
  capacity_per_day: 10,
  per_patient_per_day: 1,
  estimate_minutes: 120,
  booking_open: false,
}

export default function SessionsPage() {
  const [cfg, setCfg] = useState<Config>(EMPTY)
  const [present, setPresent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(() => {
    fetch("/api/admin/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the settings"))))
      .then((d) => {
        if (d.config) setCfg(d.config as Config)
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
      const r = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      if (d.config) setCfg(d.config as Config)
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

  // The switch does not wait for a Save button. It is the door.
  const toggleOpen = async () => {
    const want = !cfg.booking_open
    setCfg((c) => ({ ...c, booking_open: want }))
    const ok = await patch("switch", { booking_open: want })
    if (!ok) setCfg((c) => ({ ...c, booking_open: !want }))
  }

  const hours = Math.floor(cfg.estimate_minutes / 60)
  const mins = cfg.estimate_minutes % 60
  const estimateText = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the desk
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Stethoscope className="w-6 h-6 text-primary" /> Sessions
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          The private session. One price, one queue. Nothing here is written into the app.
        </p>
      </div>

      {!present ? (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            The session_config row is not in the database yet. Run 116_session_settings.sql in the
            Supabase editor, then reload this page. Nothing saved here will stick until it exists.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── THE DOOR ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Booking</CardTitle>
          <CardDescription>
            The master switch. Closed means the booking screen says so politely and takes no money.
            It saves the moment you press it, without a second button.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={toggleOpen}
            disabled={busy === "switch"}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-4 text-left transition-colors ${
              cfg.booking_open
                ? "border-green-700 bg-green-950/40"
                : "border-gray-700 bg-gray-900/60"
            }`}
          >
            <span>
              <span className={`block text-lg font-semibold ${cfg.booking_open ? "text-green-400" : "text-gray-400"}`}>
                {cfg.booking_open ? "Booking is open" : "Booking is closed"}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {cfg.booking_open
                  ? "Patients can pay and open a case, up to the daily capacity below."
                  : "Nobody can open a case. This is where it should sit until the flow is finished."}
              </span>
            </span>
            <span
              className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                cfg.booking_open ? "border-green-500 bg-green-500/30" : "border-gray-600 bg-gray-800"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
                  cfg.booking_open ? "left-6 bg-green-400" : "left-1 bg-gray-500"
                }`}
              />
            </span>
          </button>
          {busy === "switch" ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving
            </p>
          ) : saved === "switch" ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-green-500">
              <Check className="w-3 h-3" /> Saved
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── THE NUMBERS ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Capacity and time</CardTitle>
          <CardDescription>
Nothing is priced per session any more: a case is paid for by the Admission it comes out of, and a
            patient gets one session per treatment week. Capacity is what closes booking for the day.
            The estimate is what the waiting room counts down from, and a single case can still be
            given longer by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Cases a day</label>
              <Input
                type="number"
                value={cfg.capacity_per_day}
                onChange={(e) => setCfg({ ...cfg, capacity_per_day: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Booking closes for everybody when this is hit. Zero closes it outright.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Estimated time, minutes</label>
              <Input
                type="number"
                value={cfg.estimate_minutes}
                onChange={(e) => setCfg({ ...cfg, estimate_minutes: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">Shown as {estimateText}.</p>
            </div>
          </div>

          <p className="text-[11px] text-gray-600">
            At {cfg.capacity_per_day} cases a day this desk owes {cfg.capacity_per_day} finished
            Prescriptions every day. Set it to what you can actually deliver. With{" "}
one session per patient per treatment week, that is at least {cfg.capacity_per_day} different
            people.
          </p>

          <button
            type="button"
            onClick={() =>
              patch("numbers", {
                capacity_per_day: cfg.capacity_per_day,
                estimate_minutes: cfg.estimate_minutes,
              })
            }
            disabled={busy === "numbers"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "numbers" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "numbers" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the numbers
          </button>
        </CardContent>
      </Card>

      <Admission />

      <CreatorPool />

      <Voices />

      <CaseQueue />
    </div>
  )
}
