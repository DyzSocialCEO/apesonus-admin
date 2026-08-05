"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Play, Save } from "lucide-react"

interface Day {
  id: string
  opens_at: string
  closes_at: string
  prize_onus: number
  status: string
  top5: { track_id: number; title: string; artist: string; listeners: number }[] | null
  settled_at: string | null
}

interface Winner {
  rank: number
  points: number
  amount_onus: number
}

interface Withdrawal {
  id: number
  user_id: string
  wallet_address: string
  amount_onus: number
  status: string
  tx_signature: string | null
  created_at: string
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
  const [enabled, setEnabled] = useState(true)
  const [days, setDays] = useState<Day[]>([])
  const [winners, setWinners] = useState<Record<string, Winner[]>>({})
  const [cards, setCards] = useState<Record<string, number>>({})
  const [queue, setQueue] = useState<Withdrawal[]>([])
  const [noteDraft, setNoteDraft] = useState("")
  const [tx, setTx] = useState<Record<number, string>>({})

  const load = async () => {
    try {
      const res = await fetch("/api/admin/call-beta", { cache: "no-store" })
      if (!res.ok) return
      const d = await res.json()
      setPrize(String(d.config?.prize_onus ?? 5000))
      setEnabled(d.config?.enabled !== false)
      setDays(d.days ?? [])
      setWinners(d.winnersPerDay ?? {})
      setCards(d.cardsPerDay ?? {})
      setQueue(d.withdrawals ?? [])
      setNoteDraft(d.note ?? "")
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
        body: JSON.stringify({ prize_onus: Number(prize), enabled }),
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
          Free daily game. The chart counts LISTENERS, so one patient moves a song by exactly one
          however many times they replay it. Points: 2 for the exact seat, 1 for a top-five song in
          the wrong seat. The day&apos;s five best scores split the prize 40/25/15/12/8, and a share
          with nobody to claim it carries to tomorrow.
        </p>
      </div>

      {msg ? <div className="text-sm text-yellow-500">{msg}</div> : null}

      <Card className="border-gray-800 bg-gray-900/60">
        <CardContent className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Daily prize in dollars
            </label>
            <Input
              value={prize}
              onChange={(e) => setPrize(e.target.value.replace(/[^0-9]/g, ""))}
              className="max-w-sm border-gray-700 bg-gray-800 text-white"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Paid out in $PUMP, worked out at the price when it lands. Applies to days that open
              from now on, so today keeps its number.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                // The switch saves itself the moment it is pressed. A pause
                // that waits for a second button is a pause that never happens.
                const next = !enabled
                setEnabled(next)
                const res = await fetch("/api/admin/call-beta", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ enabled: next }),
                })
                if (!res.ok) {
                  setEnabled(!next)
                  setMsg("The switch did not save. Try again.")
                } else {
                  setMsg(next ? "Running. The next tick opens a day." : "Paused. No day opens, nothing settles.")
                }
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                enabled ? "border-green-700 text-green-400" : "border-gray-700 text-gray-400"
              }`}
            >
              {enabled ? "RUNNING" : "PAUSED"}
            </button>
            <span className="text-[11px] text-gray-500">
              Saves the moment you press it. Paused means no new day opens and nothing settles.
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

      <Card className="border-gray-800 bg-gray-900/60">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="text-sm font-medium text-gray-300">The doctor&apos;s line today</p>
            <p className="mt-1 text-[11px] text-gray-500">
              The tick writes one a day by itself. Type over it to say something of your own, or
              empty it to take the wall down. Same words work as the day&apos;s post, so copy it out.
            </p>
          </div>
          <Input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Nothing on the wall yet"
            className="border-gray-700 bg-gray-800 text-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const res = await fetch("/api/admin/call-beta", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ note: { line: noteDraft } }),
                })
                const d = await res.json()
                setMsg(res.ok ? "On the wall." : d.error || "Failed")
                if (res.ok) load()
              }}
              className="bg-yellow-600 font-semibold text-black hover:bg-yellow-500"
            >
              Put it on the wall
            </Button>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-300"
              onClick={() => {
                navigator.clipboard?.writeText(noteDraft)
                setMsg("Copied.")
              }}
            >
              Copy for X
            </Button>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-300"
              onClick={async () => {
                await fetch("/api/admin/call-beta", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ note: { line: "" } }),
                })
                setNoteDraft("")
                setMsg("Cleared. The next tick writes a fresh one.")
                load()
              }}
            >
              Clear and rewrite
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">The desk: withdrawals</p>
        {queue.filter((q) => q.status === "requested").length === 0 ? (
          <p className="text-sm text-gray-500">Nothing waiting.</p>
        ) : null}
        {queue.filter((q) => q.status === "requested").map((q) => (
          <Card key={q.id} className="border-yellow-900/60 bg-gray-900/60">
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-yellow-500">${Number(q.amount_onus).toFixed(2)} of $PUMP</span>
                <span className="font-mono text-xs text-gray-300">{q.wallet_address}</span>
                <span className="text-[11px] text-gray-500">{new Date(q.created_at).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={tx[q.id] ?? ""}
                  onChange={(e) => setTx({ ...tx, [q.id]: e.target.value })}
                  placeholder="Payout signature after you send the tokens"
                  className="max-w-md border-gray-700 bg-gray-800 text-white"
                />
                <Button
                  onClick={async () => {
                    const res = await fetch("/api/admin/call-beta", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ withdrawal: { id: q.id, action: "sent", tx: tx[q.id] ?? "" } }),
                    })
                    const d = await res.json()
                    setMsg(res.ok ? "Marked sent." : d.error || "Failed")
                    if (res.ok) load()
                  }}
                  className="bg-yellow-600 font-semibold text-black hover:bg-yellow-500"
                >
                  Mark sent
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const res = await fetch("/api/admin/call-beta", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ withdrawal: { id: q.id, action: "rejected" } }),
                    })
                    const d = await res.json()
                    setMsg(res.ok ? "Rejected. The amount frees up for a new request." : d.error || "Failed")
                    if (res.ok) load()
                  }}
                  className="border-gray-700 text-gray-300"
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <p className="pt-2 text-xs uppercase tracking-widest text-gray-500">Days</p>
        {days.length === 0 ? (
          <p className="text-sm text-gray-500">
            No days yet. Run the tick once and today opens.
          </p>
        ) : null}
        {days.map((w) => (
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
                  ${Number(w.prize_onus).toFixed(2)}
                </span>
                <span className="text-[11px] text-gray-500">
                  {cards[w.id] ?? 0} cards · {(winners[w.id] ?? []).length} paid
                </span>
              </div>

              {w.status === "settled" && w.top5?.length ? (
                <div className="mt-3 space-y-1">
                  {w.top5.map((t, i) => (
                    <div key={t.track_id} className="flex items-center gap-3 text-[12px]">
                      <span className="w-5 text-gray-500">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 truncate text-gray-200">{t.title}</span>
                      <span className="truncate text-gray-500">{t.artist}</span>
                      <span className="w-14 text-right text-gray-400">{t.listeners}</span>
                    </div>
                  ))}
                  {(winners[w.id] ?? []).map((win) => (
                    <div key={win.rank} className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span className="w-5" />
                      <span>Rank {win.rank}</span>
                      <span>{win.points}/10</span>
                      <span className="ml-auto text-yellow-600">${Number(win.amount_onus).toFixed(2)}</span>
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
