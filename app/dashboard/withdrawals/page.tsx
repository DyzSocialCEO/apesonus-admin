"use client"

import { useEffect, useState, useCallback } from "react"
import { Send, X, Check, ExternalLink, Wallet, AlertTriangle, Loader2, Clock } from "lucide-react"

type Row = {
  id: number; user_id: string; address: string; amount: number; status: string
  tx_signature: string | null; note: string | null
  requested_at: string; processed_at: string | null; processed_by: string | null
}

const short = (s: string) => (s && s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s)
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_COLOR: Record<string, string> = {
  requested: "text-amber-400", sending: "text-amber-400",
  sent: "text-emerald-400", failed: "text-red-400", rejected: "text-gray-500",
}

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [wallet, setWallet] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/withdrawals", { cache: "no-store" })
      const d = await r.json()
      setRows(d.withdrawals || [])
      setPendingTotal(d.pending_total || 0)
      setWallet(d.payout_wallet || null)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: "send" | "reject") => {
    if (action === "send" && !confirm("Send this USDC payment now? This moves real funds.")) return
    if (action === "reject" && !confirm("Reject this request? The funds return to the player's withdrawable balance.")) return
    setBusyId(id); setMsg("")
    try {
      const r = await fetch("/api/admin/withdrawals/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      const d = await r.json()
      if (!r.ok) setMsg(d.error || "Failed.")
      else setMsg(action === "send" ? `Sent. ${d.signature ? short(d.signature) : ""}` : "Rejected.")
      await load()
    } catch { setMsg("Network error.") } finally { setBusyId(null) }
  }

  const pending = rows.filter((r) => r.status === "requested" || r.status === "sending")
  const history = rows.filter((r) => r.status !== "requested" && r.status !== "sending")

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Withdrawals</h1>
        {pending.length > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pending</div>
            <div className="text-xl font-bold text-amber-400 tabular-nums">{usd(pendingTotal)}</div>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">Players request a payout to their address. Review and send the USDC. Funds move only when you click Send.</p>

      {/* Payout wallet */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 mb-6 flex items-center gap-3">
        <Wallet className="w-5 h-5 text-primary shrink-0" />
        {wallet ? (
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Sending from</div>
            <div className="font-mono text-sm text-white truncate">{wallet}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Keep this funded with USDC and a little SOL for fees.</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4" /> PAYOUT_WALLET_SECRET is not set. Add it in the admin environment before sending.
          </div>
        )}
      </div>

      {msg && <div className="rounded-lg bg-gray-800 text-gray-200 text-sm px-4 py-2 mb-4">{msg}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : (
        <>
          {/* Pending */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">To send ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-8 text-center text-sm text-gray-600 mb-8">No pending requests.</div>
          ) : (
            <div className="space-y-2 mb-8">
              {pending.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-white tabular-nums">{usd(r.amount)}</div>
                    <div className="font-mono text-xs text-gray-400 truncate" title={r.address}>{r.address}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5">user {short(r.user_id)} · {new Date(r.requested_at).toLocaleString()}</div>
                  </div>
                  <button disabled={busyId === r.id || !wallet} onClick={() => act(r.id, "send")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                    {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
                  </button>
                  <button disabled={busyId === r.id} onClick={() => act(r.id, "reject")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">History</h2>
          {history.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-8 text-center text-sm text-gray-600">Nothing processed yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white tabular-nums">{usd(r.amount)} <span className="text-gray-600">·</span> <span className="font-mono text-xs text-gray-400">{short(r.address)}</span></div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      {r.processed_at ? new Date(r.processed_at).toLocaleString() : ""}{r.processed_by ? ` · ${r.processed_by}` : ""}{r.note ? ` · ${r.note}` : ""}
                    </div>
                  </div>
                  <span className={`text-xs font-mono uppercase ${STATUS_COLOR[r.status] || "text-gray-500"}`}>{r.status}</span>
                  {r.tx_signature && (
                    <a href={`https://solscan.io/tx/${r.tx_signature}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
