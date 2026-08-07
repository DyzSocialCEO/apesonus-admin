"use client"

/**
 * /dashboard/call-beta — THE CALL desk.
 *
 * Weekly. Two calls a card. Counted in Spins.
 *
 * Every figure that decides money is a field here, not a number in a file:
 * what a card costs, how many songs are on the board, how many seats pay, how
 * few Spins a song can take and still be called useless, and the four points
 * of the week clock.
 *
 * THE COUNTS ARE NOT ON THIS PAGE while a round is open, on purpose. The
 * chart appears only after a round settles. An operator who can see who is
 * winning mid week is a leak with a login.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Check, Target, Shuffle, Send, X } from "lucide-react"

type Config = {
  prize_onus: number
  enabled: boolean
  entry_spins: number
  board_size: number
  winner_seats: number
  useless_min_spins: number
  lock_hours: number
  freeze_hours: number
  round_hours: number
  carry_usd: number
}

type Song = { track_id: number; title: string; artist: string; spins: number | null }

type Round = {
  id: string
  opens_at: string
  locks_at: string
  freezes_at: string
  prize_usd: number
  status: string
  board: number[]
  top_song: Song | null
  useless_song: Song | null
  chart: Song[] | null
  lock_hash: string | null
  lock_tx: string | null
  settled_at: string | null
}

type Withdrawal = {
  id: number
  user_id: string
  wallet_address: string
  amount_onus: number
  status: string
  tx_signature: string | null
  created_at: string
}

const NUMS: { key: keyof Config; label: string; hint: string }[] = [
  { key: "prize_onus", label: "Base pot each round ($)", hint: "What a fresh round starts with, before anything carried." },
  { key: "entry_spins", label: "Entry cost in Spins", hint: "Charged once per round. Burned, win or lose. A redo before the lock is free." },
  { key: "board_size", label: "Songs on the board", hint: "How many go up when a round opens." },
  { key: "winner_seats", label: "Winning seats", hint: "Correct cards are seated earliest lock first. The rest get nothing." },
  { key: "useless_min_spins", label: "Min Spins to be called useless", hint: "Below this a song cannot win Most Useless, so an untouched track cannot walk it every week." },
  { key: "lock_hours", label: "Calling shuts after (hours)", hint: "Measured from the moment the round opens. 120 is end of Thursday." },
  { key: "freeze_hours", label: "Counting stops after (hours)", hint: "162 is Saturday evening." },
  { key: "round_hours", label: "Round length (hours)", hint: "168 is a week." },
]

const fmtMoney = (n: number) => `$${Number(n ?? 0).toFixed(2)}`
const fmtWhen = (s: string | null) => (s ? String(s).replace("T", " ").slice(0, 16) : "—")

export default function CallDesk() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [winners, setWinners] = useState<Record<string, { seat: number; amount_usd: number }[]>>({})
  const [cards, setCards] = useState<Record<string, number>>({})
  const [board, setBoard] = useState<{ id: number; title: string; artist: string }[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [queue, setQueue] = useState<Withdrawal[]>([])
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState("")
  // What the last button actually did. A confirm dialog followed by silence is
  // how "End the round now" managed to do nothing for a while without anybody
  // being able to tell.
  const [said, setSaid] = useState("")
  // Which button is mid-flight. Without this a press looks identical to a
  // dead button, which is exactly how these read.
  const [busy, setBusy] = useState<string | null>(null)
  const [tx, setTx] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/call-beta", { cache: "no-store" })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || "Failed to load")
      setCfg(d.config)
      setRounds(d.rounds ?? [])
      setWinners(d.winnersPerRound ?? {})
      setCards(d.cardsPerRound ?? {})
      setBoard(d.board ?? [])
      setOpenId(d.openRoundId ?? null)
      setQueue(d.withdrawals ?? [])
      setNote(d.note ?? "")
      setErr("")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (body: Record<string, unknown>, after?: () => void) => {
    setErr("")
    const res = await fetch("/api/admin/call-beta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(d?.error || "That did not save")
      return false
    }
    after?.()
    return true
  }

  // The three buttons all hit the same route with an action, so there is one
  // place that handles a failure and one place that reloads.
  const act = async (action: string, failMessage: string) => {
    if (busy) return
    setBusy(action)
    setErr("")
    setSaid("")
    const res = await fetch("/api/admin/call-beta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(d?.error || failMessage)
      setBusy(null)
      return
    }
    setBusy(null)
    if (d?.message) setSaid(String(d.message))
    else if (d?.opened) setSaid(`Round ${d.opened} is open.`)
    else if (d?.settled) setSaid(`Round ${d.settled} settled.`)
    else setSaid("Nothing to do. Nothing was open or finished.")
    load()
  }

  const saveNumbers = async () => {
    if (!cfg || saving) return
    setSaving(true)
    const body: Record<string, unknown> = {}
    for (const n of NUMS) body[n.key] = Number(cfg[n.key])
    const ok = await patch(body)
    setSaving(false)
    if (ok) {
      setFlash(true)
      setTimeout(() => setFlash(false), 1600)
      load()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">The Call</h1>
          <p className="text-sm text-gray-500">
            Weekly. Two calls a card, off a board of {cfg?.board_size ?? 10}. Counted in Spins spent, so
            replays count and every count traces to money.
          </p>
        </div>
      </div>

      {err && (
        <div className="text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">{err}</div>
      )}
      {said && (
        <div className="text-xs rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 px-3 py-2">{said}</div>
      )}

      {/* Running / paused. Saves the instant it is pressed. */}
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            const next = !cfg?.enabled
            setCfg((c) => (c ? { ...c, enabled: next } : c))
            const ok = await patch({ enabled: next })
            if (!ok) setCfg((c) => (c ? { ...c, enabled: !next } : c))
          }}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            cfg?.enabled ? "border-green-700 text-green-400" : "border-gray-700 text-gray-400"
          }`}
        >
          {cfg?.enabled ? "RUNNING" : "PAUSED"}
        </button>
        <button
          onClick={() => act("tick", "Tick failed")}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 disabled:opacity-50"
        >
          {busy === "tick" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy === "tick" ? "Working" : "Run the tick now"}
        </button>
        <button
          onClick={() => {
            if (confirm("End this round now? It counts the chart, works out both winners and pays the seats.")) {
              act("settle", "Could not end the round")
            }
          }}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-yellow-700 px-4 py-2 text-sm text-yellow-400 disabled:opacity-50"
        >
          {busy === "settle" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy === "settle" ? "Working" : "End the round now"}
        </button>
        <button
          onClick={() => {
            if (confirm("Start a fresh round beginning right now? The current one is thrown away.")) {
              act("fresh", "Could not start a fresh round")
            }
          }}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 disabled:opacity-50"
        >
          {busy === "fresh" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy === "fresh" ? "Working" : "Start a fresh round"}
        </button>
        <span className="text-xs text-gray-500">
          Carried and waiting for the next round: {fmtMoney(cfg?.carry_usd ?? 0)}
        </span>
      </div>

      <p className="-mt-4 text-xs text-gray-600 max-w-3xl">
        Run the tick is the hourly job by hand: it settles anything finished and opens a round
        only when nothing is open. A round opens on the weekly calendar, so asking for one
        mid week gives you one whose calling window has already shut. Start a fresh round begins
        at this moment instead, which is what you want for a test or a restart.
        Paused only stops the hourly job. End the round now still works while paused.
      </p>

      {/* Every figure that decides money */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="font-semibold text-white mb-1">The numbers</h2>
        <p className="text-xs text-gray-500 mb-4">
          Nothing about the Call is written into the code. Change it here and it applies from the next
          round, with no deploy.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {NUMS.map((n) => (
            <div key={n.key}>
              <label className="mb-1 block text-sm font-medium text-gray-300">{n.label}</label>
              <input
                type="number"
                min={0}
                value={String(cfg?.[n.key] ?? 0)}
                onChange={(e) =>
                  setCfg((c) => (c ? { ...c, [n.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) } : c))
                }
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              />
              <p className="mt-1 text-[11px] text-gray-600">{n.hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={saveNumbers}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : flash ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the numbers
          </button>
        </div>
      </div>

      {/* This week's board */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-white">This round&apos;s board</h2>
          <button
            onClick={async () => {
              if (await patch({ reshuffle: true })) load()
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
          >
            <Shuffle className="w-4 h-4" /> Reshuffle
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {openId ? `Round ${openId}.` : "No round open."} The board can only be changed while nobody has
          called on it. Once one card is in, changing it would be changing the question after the answers
          are in, and the desk refuses.
        </p>
        {board.length === 0 ? (
          <div className="text-xs text-gray-600">Nothing on the board yet.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-1.5">
            {board.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
                <span className="font-mono text-[11px] text-gray-600">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 truncate text-sm text-white">{t.title}</span>
                <span className="truncate text-xs text-gray-500">{t.artist}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-600">
          Cards on this board: {openId ? (cards[openId] ?? 0) : 0}. What each song has taken is not shown
          until the round settles, including here.
        </p>
      </div>

      {/* Withdrawals */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="font-semibold text-white mb-4">Withdrawal queue</h2>
        {queue.filter((w) => w.status === "requested").length === 0 ? (
          <div className="text-xs text-gray-600">Nothing waiting.</div>
        ) : (
          <div className="space-y-2">
            {queue
              .filter((w) => w.status === "requested")
              .map((w) => (
                <div key={w.id} className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-white">{fmtMoney(w.amount_onus)}</span>
                    <span className="font-mono text-[11px] text-gray-500 break-all">{w.wallet_address}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={tx[w.id] ?? ""}
                      onChange={(e) => setTx((m) => ({ ...m, [w.id]: e.target.value }))}
                      placeholder="Payout signature"
                      className="flex-1 min-w-[220px] bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                    <button
                      onClick={async () => {
                        if (await patch({ withdrawal: { id: w.id, action: "sent", tx: tx[w.id] ?? "" } })) load()
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-green-700 px-3 py-1.5 text-xs text-green-400"
                    >
                      <Send className="w-3.5 h-3.5" /> Mark sent
                    </button>
                    <button
                      onClick={async () => {
                        if (await patch({ withdrawal: { id: w.id, action: "rejected" } })) load()
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* The doctor's wall */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="font-semibold text-white mb-1">The wall</h2>
        <p className="text-xs text-gray-500 mb-3">
          The hourly tick writes one line a day by itself. Typing over it here replaces today&apos;s line.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              if (await patch({ note: { line: note } })) load()
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-black"
          >
            Put it on the wall
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(note)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300"
          >
            Copy for X
          </button>
          <button
            onClick={async () => {
              setNote("")
              if (await patch({ note: { line: "" } })) load()
            }}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400"
          >
            Clear and rewrite
          </button>
        </div>
      </div>

      {/* Rounds */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Rounds</h2>
        </div>
        {rounds.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-600">No rounds yet.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {rounds.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-sm text-white">{r.id}</span>
                  <span className="text-[11px] uppercase tracking-wider text-gray-500">{r.status}</span>
                  <span className="text-xs text-gray-400">{fmtMoney(r.prize_usd)}</span>
                  <span className="text-xs text-gray-500">{cards[r.id] ?? 0} cards</span>
                  <span className="text-xs text-gray-600">
                    calls shut {fmtWhen(r.locks_at)} · counting stopped {fmtWhen(r.freezes_at)}
                  </span>
                </div>

                {r.status === "settled" ? (
                  <div className="mt-2 grid sm:grid-cols-2 gap-2">
                    <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">Ran the ward</div>
                      <div className="text-sm text-white">
                        {r.top_song ? `${r.top_song.title} · ${r.top_song.spins ?? 0} Spins` : "no chart"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">Did nothing</div>
                      <div className="text-sm text-white">
                        {r.useless_song ? `${r.useless_song.title} · ${r.useless_song.spins ?? 0} Spins` : "nothing qualified"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-gray-600">
                    Counts stay hidden until this round settles.
                  </div>
                )}

                {(winners[r.id] ?? []).length > 0 ? (
                  <div className="mt-2 text-xs text-gray-400">
                    Paid:{" "}
                    {(winners[r.id] ?? [])
                      .sort((a, b) => a.seat - b.seat)
                      .map((w) => `seat ${w.seat} ${fmtMoney(w.amount_usd)}`)
                      .join(" · ")}
                  </div>
                ) : r.status === "settled" ? (
                  <div className="mt-2 text-xs text-gray-500">Nobody got both. The pot rode on.</div>
                ) : null}

                {r.lock_hash ? (
                  <div className="mt-2 break-all font-mono text-[10px] text-gray-600">
                    fingerprint {r.lock_hash}
                    {r.lock_tx ? ` · stamp ${r.lock_tx}` : " · not stamped yet"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
