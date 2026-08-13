"use client"

/**
 * /dashboard/airdrop
 *
 * The Airdrop desk, exactly the approved journey: a fixed pot and a window
 * while OPEN (the desk is read only, the list moves as patients earn), then
 * LOCK freezes the split into the list to check before anything moves. Every
 * payment is made by hand from the treasury and stamped onto its row.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Lock, Check, Copy } from "lucide-react"

type Win = {
  id: number
  pot: number
  symbol: string
  opens_at: string
  closes_at: string
  status: "open" | "locked"
  locked_at: string | null
}

type Row = {
  user_id: string
  number: number | null
  score: number
  pays: number | null
  wallet: string | null
  paid_at?: string | null
  tx?: string | null
  doses?: number
  days?: number
  treatments?: number
  spins?: number
  certs?: number
}

type PastWin = { id: number; pot: number; symbol: string; opens_at: string; closes_at: string }

const fmt = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp })

const short = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w)

function untilText(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "past its close"
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return `${d}d ${h}h`
}

export default function AirdropPage() {
  const [win, setWin] = useState<Win | null>(null)
  const [list, setList] = useState<Row[]>([])
  const [past, setPast] = useState<PastWin[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [pot, setPot] = useState("")
  const [days, setDays] = useState("14")
  const [symbol, setSymbol] = useState("USDC")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/airdrop", { cache: "no-store" })
      const d = await r.json()
      setWin(d.window ?? null)
      setList(Array.isArray(d.list) ? d.list : [])
      setPast(Array.isArray(d.past) ? d.past : [])
    } catch {
      setMsg("Could not load.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const act = async (label: string, payload: Record<string, unknown>, confirmText?: string) => {
    if (busy) return
    if (confirmText && !confirm(confirmText)) return
    setBusy(label)
    setMsg(null)
    try {
      const r = await fetch("/api/admin/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok || d?.error) {
        setMsg(String(d?.error || `Failed (${r.status})`))
      } else {
        setMsg(null)
        await load()
      }
    } catch {
      setMsg("Something went wrong.")
    } finally {
      setBusy(null)
    }
  }

  const openWindow = () => {
    const p = Number(pot)
    const dNum = Number(days)
    const sym = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    if (!sym || sym.length > 12) {
      setMsg("The currency needs a ticker, letters and numbers only, 12 max.")
      return
    }
    if (!Number.isFinite(p) || p <= 0) {
      setMsg("The pot needs a number above zero.")
      return
    }
    if (!Number.isFinite(dNum) || dNum < 1 || dNum > 90) {
      setMsg("The window is 1 to 90 days.")
      return
    }
    const closes = new Date(Date.now() + dNum * 86400000).toISOString()
    void act("open", { what: "open", pot: p, closes_at: closes, symbol: sym })
  }

  const markPaid = (row: Row) => {
    if (!win) return
    const tx = prompt(`Tx signature for patient #${row.number ?? "?"} (${fmt(Number(row.pays ?? 0), 6)} ${win.symbol}):`, row.tx ?? "")
    if (tx === null) return
    void act(`paid-${row.user_id}`, { what: "mark_paid", window_id: win.id, user_id: row.user_id, tx })
  }

  const copyPayList = () => {
    const lines = list
      .filter((r) => r.wallet && r.pays != null)
      .map((r) => `${r.wallet},${Number(r.pays).toFixed(6)}`)
    navigator.clipboard.writeText(lines.join("\n"))
    setMsg(`Copied ${lines.length} lines: wallet,amount.`)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the airdrop...
      </div>
    )
  }

  const unpaid = list.filter((r) => !r.paid_at).length

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">The Airdrop</h1>
          <p className="mt-1 text-gray-400">
            A fixed pot, split over a window on the engagement score. Nothing moves until you press it.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {msg ? <p className="mt-4 text-sm text-amber-400">{msg}</p> : null}

      {!win ? (
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-bold text-white">Open a window</h2>
          <p className="mt-1 text-sm text-gray-500">
            The pot is fixed the moment it opens. The desk never tops it up on its own.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Pot ({symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "?"})</label>
              <input
                value={pot}
                onChange={(e) => setPot(e.target.value)}
                inputMode="numeric"
                placeholder="250000"
                className="w-40 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Currency</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="USDC"
                className="w-28 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Window (days)</label>
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                inputMode="numeric"
                className="w-24 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <button
              type="button"
              onClick={openWindow}
              disabled={busy === "open"}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300 disabled:opacity-40"
            >
              {busy === "open" ? "Opening..." : "Open the window"}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            Scores count inside the window only: doses x3, days attended x5, treatments x1, Spins
            spent x2, certificates x10. Only patients with a wallet proven through The Records can
            be paid; anyone else is left out at lock and the pot splits fully over the rest.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">The pot</div>
              <div className="mt-1 text-xl font-bold text-white">
                {fmt(Number(win.pot))} {win.symbol}
              </div>
              <div className="mt-1 text-xs text-gray-600">Fixed when the window opened.</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">The window</div>
              <div className="mt-1 text-xl font-bold text-white">
                {win.status === "open" ? `Closes in ${untilText(win.closes_at)}` : "Locked"}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {new Date(win.opens_at).toLocaleDateString()} to {new Date(win.closes_at).toLocaleDateString()}
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {win.status === "open" ? "Qualified so far" : "On the list"}
              </div>
              <div className="mt-1 text-xl font-bold text-white">{list.length} patients</div>
              <div className="mt-1 text-xs text-gray-600">
                {win.status === "open"
                  ? "Score above zero. No proven wallet = no pay at lock."
                  : `${unpaid} still to pay`}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {win.status === "open" ? "Live standings" : "The split"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {win.status === "open"
                    ? "Moves as patients earn. LOCK closes the maths, not the music."
                    : "Frozen at lock. Check it line by line, pay by hand from the treasury, stamp each row with its tx."}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest ${
                  win.status === "open"
                    ? "border-lime-500/40 bg-lime-500/10 text-lime-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                }`}
              >
                {win.status === "open" ? "WINDOW OPEN" : "LOCKED"}
              </span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-500">
                    <th className="px-2 py-2">Patient</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2">Pays</th>
                    <th className="px-2 py-2">Wallet</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.user_id} className="border-b border-gray-800/60 text-gray-300">
                      <td className="px-2 py-2">#{r.number ?? "?"}</td>
                      <td className="px-2 py-2">
                        {r.score}
                        {win.status === "open" && r.doses != null ? (
                          <span className="ml-2 text-[10px] text-gray-600">
                            {r.doses}d / {r.days}days / {r.treatments}t / {r.spins}s / {r.certs}c
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        {r.pays != null ? `${fmt(Number(r.pays), 6)} ${win.symbol}` : ""}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {r.wallet ? (
                          <span className="text-gray-400">{short(r.wallet)} · PROVEN</span>
                        ) : (
                          <span className="font-sans font-bold text-red-400">NO PROVEN WALLET</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {win.status === "locked" ? (
                          r.paid_at ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400">
                              <Check className="h-3 w-3" /> PAID{r.tx ? ` · ${short(r.tx)}` : ""}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markPaid(r)}
                              disabled={busy != null}
                              className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 hover:text-white disabled:opacity-40"
                            >
                              MARK PAID
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-gray-600">
                        Nobody has a score yet. The list fills as patients take treatment.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {win.status === "open" ? (
                <button
                  type="button"
                  onClick={() =>
                    act("lock", { what: "lock", window_id: win.id },
                      "Lock the window? The split freezes exactly as shown. Listening keeps going; the maths stops. This cannot be reopened.")
                  }
                  disabled={busy != null}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300 disabled:opacity-40"
                >
                  <Lock className="h-4 w-4" /> {busy === "lock" ? "Locking..." : "Lock the window"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={copyPayList}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    <Copy className="h-4 w-4" /> Copy the pay list
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act("finish", { what: "finish", window_id: win.id },
                        unpaid > 0
                          ? `${unpaid} share${unpaid === 1 ? "" : "s"} still unpaid. Finishing is refused until every row is stamped, unless you force it later.`
                          : "Close the book on this window? A new one can open after.")
                    }
                    disabled={busy != null}
                    className="inline-flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" /> {busy === "finish" ? "Finishing..." : "Finish the window"}
                  </button>
                </>
              )}
            </div>
            {win.status === "locked" ? (
              <p className="mt-3 text-xs text-gray-600">
                The desk sends nothing itself: every payment is your hand, every row wants its tx
                signature. The pay list copies as wallet,amount for pasting into a wallet or a
                sheet.
              </p>
            ) : null}
          </div>
        </>
      )}

      {past.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Past windows</h2>
          <div className="mt-2 space-y-2">
            {past.map((p) => (
              <div key={p.id} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-400">
                #{p.id}: {fmt(Number(p.pot))} {p.symbol}, {new Date(p.opens_at).toLocaleDateString()} to{" "}
                {new Date(p.closes_at).toLocaleDateString()}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
