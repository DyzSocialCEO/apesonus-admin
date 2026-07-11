"use client"

/**
 * /dashboard/payouts — the cash payout queue.
 *
 * Every cash reward a player has requested to withdraw lands here. You send the
 * USDC/token from the house wallet, paste the transaction signature, and mark
 * it paid — that stamps the tx and moves it to the Paid tab. Spins rewards
 * never appear here; they credit automatically. Toggle Pending / Paid to see
 * what's owed vs. what's been sent.
 */

import { useEffect, useState } from "react"
import { DollarSign, Loader2, Check, Send } from "lucide-react"

type Claim = {
  id: number
  wallet: string | null
  currency: string
  token_mint: string | null
  value: number
  track_title: string | null
  tx_signature: string | null
  won_at: string
  paid_at: string | null
  needs_wallet: boolean
}

const fmtV = (n: number) => (Number.isInteger(n) ? (n || 0).toLocaleString("en-US") : (Math.round(n * 100) / 100).toLocaleString("en-US"))
const curLabel = (c: string) => (c === "usdc" ? "USDC" : c === "spins" ? "SPINS" : "TOKEN")
const shortWallet = (w: string | null) => (w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "—")

export default function PayoutsPage() {
  const [view, setView] = useState<"requested" | "sent">("requested")
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [results, setResults] = useState<{ id: number; ok: boolean; signature?: string; error?: string }[]>([])
  const [paying, setPaying] = useState(false)

  const load = () => {
    setLoading(true); setErr(""); setSel(new Set())
    fetch(`/api/admin/payouts?status=${view}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setClaims(d.claims || []) })
      .catch(() => setErr("Could not reach the server"))
      .finally(() => setLoading(false))
  }
  useEffect(load, [view])

  const payable = claims.filter((c) => !c.needs_wallet)
  const toggle = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }

  const selTotals: Record<string, number> = {}
  for (const c of claims) if (sel.has(c.id)) selTotals[c.currency] = (selTotals[c.currency] || 0) + c.value

  const sendBatch = async () => {
    if (sel.size === 0) return
    if (!window.confirm(`Send USDC to ${sel.size} winner(s) now? This moves real funds and can't be undone.`)) return
    setPaying(true); setResults([])
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(sel) }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setResults(j.results || []); setTimeout(load, 1500) }
      else setErr(j.error || "Send failed")
    } finally { setPaying(false) }
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2"><DollarSign className="w-6 h-6 text-primary" /><h1 className="text-xl font-bold text-white">Payouts</h1></div>
        <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded-lg p-0.5">
          {(["requested", "sent"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold ${view === v ? "bg-primary text-gray-950" : "text-gray-400 hover:text-white"}`}>
              {v === "requested" ? "Requested" : "Sent"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-gray-500 mb-4">
        {view === "requested"
          ? "Winners who claimed and gave a wallet. Select and Send USDC — the server sends each transfer and records it."
          : "Prizes already paid, with their on-chain signatures."}
      </p>

      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-500">
          {view === "requested" ? "No claims waiting to be paid." : "Nothing paid yet."}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          {view === "requested" && (
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setSel(new Set(payable.map((c) => c.id)))} className="text-xs text-primary hover:underline">Select all payable ({payable.length})</button>
              <button onClick={() => setSel(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
            </div>
          )}

          <div className="space-y-1.5 max-h-[26rem] overflow-y-auto pr-1">
            {claims.map((c) => {
              const selectable = view === "requested" && !c.needs_wallet
              return (
                <div key={c.id} onClick={() => selectable && toggle(c.id)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${c.needs_wallet ? "border-gray-800 opacity-50" : sel.has(c.id) ? "border-primary bg-primary/5 cursor-pointer" : "border-gray-800 " + (selectable ? "hover:border-gray-700 cursor-pointer" : "")}`}>
                  {view === "requested" && (
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${sel.has(c.id) ? "bg-primary" : "border border-gray-700"}`}>
                      {sel.has(c.id) && <Check className="w-3 h-3 text-gray-950" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-mono">{fmtV(c.value)} {curLabel(c.currency)}</div>
                    <div className="text-[11px] text-gray-500 truncate font-mono">
                      {c.needs_wallet ? "no wallet on file — user must request" : shortWallet(c.wallet)}
                      {c.tx_signature ? ` · tx ${c.tx_signature.slice(0, 8)}…` : ""}
                    </div>
                  </div>
                  {c.track_title && <div className="text-[11px] text-gray-600 shrink-0">{c.track_title}</div>}
                </div>
              )
            })}
          </div>

          {view === "requested" && sel.size > 0 && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
              <div className="text-xs text-gray-400 mb-2">
                Paying {sel.size}: {Object.entries(selTotals).map(([c, v]) => `$${fmtV(v)} ${curLabel(c)}`).join(" · ")} from the payout wallet
              </div>
              <button onClick={sendBatch} disabled={paying}
                className="w-full bg-primary text-gray-950 font-semibold text-sm py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send USDC to {sel.size}
              </button>
              {results.length > 0 && (
                <div className="mt-3 space-y-1 text-[11px] font-mono">
                  {results.map((r) => (
                    <div key={r.id} className={r.ok ? "text-green-400" : "text-red-400"}>
                      #{r.id} {r.ok ? `sent · ${r.signature?.slice(0, 10)}…` : `failed · ${r.error}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
