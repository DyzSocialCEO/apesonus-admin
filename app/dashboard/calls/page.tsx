"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

/**
 * WARD CALLS desk.
 *
 * Create a call, watch the day's calls move through their states, and,
 * only with a written reason, override or void one. Settlement itself is
 * the cron's job against real market data; nothing here decides a result
 * silently.
 */

type Call = {
  id: number
  asset: string
  pair: string | null
  call_type: string
  question: string
  options: Array<{ label: string; mint?: string | null }>
  mint: string | null
  target: number | null
  opens_at: string
  locks_at: string
  settles_at: string
  status: string
  result: number | null
  no_decision: boolean
  override_by: string | null
  override_reason: string | null
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "border-gray-700 text-gray-400",
  open: "border-lime-400 text-lime-400",
  locked: "border-purple-400 text-purple-300",
  settling: "border-purple-400 text-purple-300",
  settled: "border-gray-700 text-gray-400",
  void: "border-red-500 text-red-400",
}

function fmt(t: string) {
  return new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [callType, setCallType] = useState("above_below")
  const [asset, setAsset] = useState("SOL")
  const [pair, setPair] = useState("SOL/USDC")
  const [question, setQuestion] = useState("WHERE DOES SOL CLOSE?")
  const [mint, setMint] = useState("")
  const [target, setTarget] = useState("")
  const [opts, setOpts] = useState<Array<{ label: string; mint: string }>>([
    { label: "", mint: "" },
    { label: "", mint: "" },
    { label: "", mint: "" },
  ])
  const [opensAt, setOpensAt] = useState("")
  const [locksAt, setLocksAt] = useState("")
  const [settlesAt, setSettlesAt] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/calls", { cache: "no-store" })
      const d = await r.json()
      setCalls(Array.isArray(d.calls) ? d.calls : [])
      setCounts(d.counts || {})
    } catch {
      setMsg("Could not load.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const act = async (label: string, payload: Record<string, unknown>) => {
    if (busy) return
    setBusy(label)
    setMsg(null)
    try {
      const r = await fetch("/api/admin/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok || d?.error) setMsg(String(d?.error || `Failed (${r.status})`))
      else await load()
    } catch {
      setMsg("Request failed.")
    } finally {
      setBusy(null)
    }
  }

  const create = () => {
    const payload: Record<string, unknown> = {
      what: "create",
      call_type: callType,
      asset,
      pair,
      question,
      opens_at: opensAt ? new Date(opensAt).toISOString() : "",
      locks_at: locksAt ? new Date(locksAt).toISOString() : "",
      settles_at: settlesAt ? new Date(settlesAt).toISOString() : "",
    }
    if (callType === "above_below") {
      payload.mint = mint
      payload.target = Number(target)
    } else {
      payload.options = opts.filter((o) => o.label.trim() && o.mint.trim())
    }
    void act("create", payload)
  }

  const overrideCall = (c: Call) => {
    const winner = prompt(
      `Override #${c.id}. Type the winning option number (0-${c.options.length - 1}), or ND for no decision:`
    )
    if (winner == null) return
    const reason = prompt("Written reason (stored on the row forever):")
    if (!reason || !reason.trim()) return
    const nd = winner.trim().toUpperCase() === "ND"
    void act(`override-${c.id}`, {
      what: "override",
      call_id: c.id,
      no_decision: nd,
      result: nd ? null : Number(winner),
      reason: reason.trim(),
    })
  }

  const voidCall = (c: Call) => {
    const reason = prompt(`Void #${c.id}. Written reason:`)
    if (!reason || !reason.trim()) return
    void act(`void-${c.id}`, { what: "void", call_id: c.id, reason: reason.trim() })
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ward Calls</h1>
          <p className="mt-1 text-gray-400">
            The market settles calls through the cron. The desk creates them and, with a written reason, overrides or
            voids them.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-900"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {msg ? <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{msg}</div> : null}

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 className="text-lg font-semibold text-white">Create a call</h2>
        <p className="mt-1 text-sm text-gray-500">
          Above/below settles one mint against the target: option 0 is ABOVE, option 1 is BELOW. Best performer settles
          the biggest percent move from open to settlement across the option mints.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Type</label>
            <select
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              <option value="above_below">Above / below</option>
              <option value="best_performer">Best performer</option>
              <option value="" disabled>
                Hit first (phase 2)
              </option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Asset</label>
            <input value={asset} onChange={(e) => setAsset(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Pair (display)</label>
            <input value={pair} onChange={(e) => setPair(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-400">Question shown to patients</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
        </div>

        {callType === "above_below" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Mint (priced asset)</label>
              <input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="So11111111111111111111111111111111111111112" className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 font-mono text-xs text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Target (USD)</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="190" className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {opts.map((o, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={o.label}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder={`Option ${i + 1} label (SOL)`}
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                />
                <input
                  value={o.mint}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, mint: e.target.value } : x)))}
                  placeholder="Mint"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
            ))}
            <p className="text-xs text-gray-500">Two or three options. The third row can stay empty.</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Opens</label>
            <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Locks</label>
            <input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Settles</label>
            <input type="datetime-local" value={settlesAt} onChange={(e) => setSettlesAt(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <button
          onClick={create}
          disabled={busy === "create"}
          className="mt-5 rounded-lg bg-amber-500/90 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {busy === "create" ? "Scheduling…" : "Schedule the call"}
        </button>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">Recent calls</h2>
        {loading ? <p className="mt-3 text-sm text-gray-500">Loading…</p> : null}
        <div className="mt-3 space-y-3">
          {calls.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">
                    #{c.id} · {c.asset} · {c.question}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {c.call_type} · {counts[c.id] || 0} calls in · opens {fmt(c.opens_at)} · locks {fmt(c.locks_at)} ·
                    settles {fmt(c.settles_at)}
                    {c.status === "settled" && !c.no_decision && c.result != null
                      ? ` · winner: ${c.options[c.result]?.label ?? c.result}`
                      : ""}
                    {c.no_decision ? " · NO DECISION" : ""}
                    {c.override_by ? ` · OVERRIDE by ${c.override_by}: ${c.override_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-2 py-1 text-xs uppercase tracking-wider ${STATUS_STYLE[c.status] || ""}`}>
                    {c.status}
                  </span>
                  {["settling", "locked", "settled"].includes(c.status) ? (
                    <button onClick={() => overrideCall(c)} className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800">
                      Override
                    </button>
                  ) : null}
                  {["scheduled", "open", "locked", "settling"].includes(c.status) ? (
                    <button onClick={() => voidCall(c)} className="rounded border border-red-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950/40">
                      Void
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {!loading && calls.length === 0 ? <p className="text-sm text-gray-500">No calls yet. Schedule the first one above.</p> : null}
        </div>
      </div>
    </div>
  )
}
