"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Play, Save } from "lucide-react"

interface Week {
  id: string
  opens_at: string
  closes_at: string
  prize_onus: number
  status: string
  top5: { track_id: number; title: string; artist: string; counted: number }[] | null
  settled_at: string | null
}

/**
 * THE CALL (beta) — the free weekly game.
 *
 * Scoring lives in call_week_tick() in the database, so this desk only sets
 * the knobs and shows what happened. The chart of an OPEN week is deliberately
 * absent here too: it does not exist until the week settles.
 */
export default function CallBetaPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ticking, setTicking] = useState(false)
  const [msg, setMsg] = useState("")

  const [prize, setPrize] = useState("25000")
  const [cap, setCap] = useState("3")
  const [enabled, setEnabled] = useState(true)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [winners, setWinners] = useState<Record<string, number>>({})
  const [cards, setCards] = useState<Record<string, number>>({})

  const load = async () => {
    try {
      const res = await fetch("/api/admin/call-beta", { cache: "no-store" })
      if (!res.ok) return
      const d = await res.json()
      setPrize(String(d.config?.prize_onus ?? 25000))
      setCap(String(d.config?.play_cap ?? 3))
      setEnabled(d.config?.enabled !== false)
      setWeeks(d.weeks ?? [])
      setWinners(d.winnersPerWeek ?? {})
      setCards(d.cardsPerWeek ?? {})
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/call-beta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize_onus: Number(prize),
          play_cap: Number(cap),
          enabled,
        }),
      })
      const d = await res.json()
      setMsg(res.ok ? "Saved. It applies to the next week that opens." : d.error || "Save failed")
      if (res.ok) load()
    } finally {
      setSaving(false)
    }
  }

  const runTick = async () => {
    setTicking(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/call-beta", { method: "POST" })
      const d = await res.json()
      setMsg(
        res.ok
          ? `Opened ${d.opened || "nothing"}, settled ${d.settled || "nothing"}.`
          : d.error || "Tick failed",
      )
      if (res.ok) load()
    } finally {
      setTicking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the desk
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">The Call (beta)</h1>
        <p className="mt-1 text-sm text-gray-400">
          Free weekly game. Call the five most played songs in exact order, win the week&apos;s
          $ONUS. Nobody calls it, the prize carries into the next week.
        </p>
      </div>

      {msg ? <div className="text-sm text-yellow-500">{msg}</div> : null}

      <Card className="border-gray-800 bg-gray-900/60">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Weekly prize in $ONUS
              </label>
              <Input
                value={prize}
                onChange={(e) => setPrize(e.target.value.replace(/[^0-9]/g, ""))}
                className="border-gray-700 bg-gray-800 text-white"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Applies to weeks that open from now on. A week already open keeps its number.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Counts per song per patient
              </label>
              <Input
                value={cap}
                onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))}
                className="border-gray-700 bg-gray-800 text-white"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                How far one person can push one song in a week. Everything past this still plays and
                still counts as a play, it just stops moving the chart.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setEnabled(!enabled)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                enabled ? "border-green-700 text-green-400" : "border-gray-700 text-gray-400"
              }`}
            >
              {enabled ? "RUNNING" : "PAUSED"}
            </button>
            <span className="text-[11px] text-gray-500">
              Paused means no new week opens and nothing settles.
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={saveConfig}
              disabled={saving}
              className="bg-yellow-600 font-semibold text-black hover:bg-yellow-500"
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
            <Button onClick={runTick} disabled={ticking} variant="outline" className="border-gray-700 text-gray-300">
              {ticking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Run the tick now
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Weeks</p>
        {weeks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No weeks yet. Run the tick once and this week opens.
          </p>
        ) : null}
        {weeks.map((w) => (
          <Card key={w.id} className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-white">{w.id}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-widest ${
                    w.status === "open" ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {w.status.toUpperCase()}
                </span>
                <span className="text-sm text-yellow-500">
                  {Number(w.prize_onus).toLocaleString()} $ONUS
                </span>
                <span className="text-[11px] text-gray-500">
                  {cards[w.id] ?? 0} cards · {winners[w.id] ?? 0} winners
                </span>
              </div>

              {w.status === "settled" && w.top5?.length ? (
                <div className="mt-3 space-y-1">
                  {w.top5.map((t, i) => (
                    <div key={t.track_id} className="flex items-center gap-3 text-[12px]">
                      <span className="w-5 text-gray-500">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 truncate text-gray-200">{t.title}</span>
                      <span className="truncate text-gray-500">{t.artist}</span>
                      <span className="w-14 text-right text-gray-400">{t.counted}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
