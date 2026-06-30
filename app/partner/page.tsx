"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2, LogOut, Users2, Wrench, Code2, Wallet, KeyRound, X, Check, ExternalLink } from "lucide-react"

const ACID = "#c6ff2e"
const usd = (c: number) => `$${((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Payout = { amount_cents: number; status: string; tx_signature: string | null; method: string; created_at: string }
type Data = {
  gross_cents: number; ops_pct: number; team_pct: number; eco_pct: number
  ops_cents: number; team_cents: number; eco_cents: number
  partner: { name: string; share_pct: number; accrued_cents: number; paid_cents: number; owed_cents: number; is_locked: boolean; is_active: boolean }
  payouts: Payout[]
}

export default function PartnerPortal() {
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [cur, setCur] = useState(""); const [nxt, setNxt] = useState("")
  const [pwMsg, setPwMsg] = useState(""); const [pwOk, setPwOk] = useState(false); const [pwBusy, setPwBusy] = useState(false)

  useEffect(() => {
    fetch("/api/partner/overview", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) { setErr(j.error || `Error ${r.status}`); return }
        setD(j as Data)
      })
      .catch(() => setErr("Could not reach the server"))
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    router.push("/login"); router.refresh()
  }
  const changePw = async () => {
    setPwBusy(true); setPwMsg(""); setPwOk(false)
    try {
      const r = await fetch("/api/partner/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next: nxt }) })
      const j = await r.json()
      if (!r.ok) { setPwMsg(j.error || "Could not change password"); return }
      setPwOk(true); setPwMsg("Password updated."); setCur(""); setNxt(""); setTimeout(() => { setShowPw(false); setPwOk(false); setPwMsg("") }, 1400)
    } catch { setPwMsg("Could not change password") } finally { setPwBusy(false) }
  }

  const booksUrl = process.env.NEXT_PUBLIC_BOOKS_URL

  return (
    <div className="min-h-screen text-white" style={{ background: "#0a0a0f" }}>
      {/* top bar */}
      <div className="border-b border-white/5">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: ACID }}>
            <ShieldCheck className="w-5 h-5" />
            <span className="font-mono text-xs uppercase tracking-[0.2em]">APESONUS · Partner</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPw(true)} className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white rounded-full px-3 py-1.5 border border-white/10">
              <KeyRound className="w-3.5 h-3.5" /> Password
            </button>
            <button onClick={logout} className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white rounded-full px-3 py-1.5 border border-white/10">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8">
        {loading ? (
          <div className="flex items-center gap-2 text-white/40 text-sm py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> loading…</div>
        ) : err || !d ? (
          <div className="rounded-2xl border border-white/10 p-6">
            <p className="text-white/70 text-sm">Couldn&apos;t load your dashboard{err ? `: ${err}` : ""}.</p>
            <button onClick={() => location.reload()} className="mt-4 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: ACID, color: "#0a0a0f" }}>Retry</button>
          </div>
        ) : (
          <>
            <p className="text-white/45 text-sm">Welcome back,</p>
            <h1 className="text-2xl font-bold mb-1">{d.partner.name}</h1>
            <p className="text-white/40 text-xs mb-7">Read-only view of revenue and your share. Figures update as purchases settle.</p>

            {/* gross */}
            <div className="rounded-2xl border p-5 mb-3" style={{ borderColor: "rgba(198,255,46,0.25)", background: "linear-gradient(180deg, rgba(198,255,46,0.06), transparent)" }}>
              <div className="text-white/45 text-[11px] uppercase tracking-wide">Gross revenue · all time</div>
              <div className="font-mono mt-1" style={{ fontSize: 40, color: ACID }}>{usd(d.gross_cents)}</div>
              <div className="text-white/35 text-[11px] mt-1">total players have paid, before any split</div>
            </div>

            {/* the split */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: Users2, label: "Team", pct: d.team_pct, val: d.team_cents },
                { icon: Wrench, label: "Operational", pct: d.ops_pct, val: d.ops_cents },
                { icon: Code2, label: "Development", pct: d.eco_pct, val: d.eco_cents },
              ].map((p) => (
                <div key={p.label} className="rounded-2xl border border-white/10 p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center gap-1.5 text-white/45 text-[11px] uppercase tracking-wide"><p.icon className="w-3.5 h-3.5" /> {p.label}</div>
                  <div className="text-lg font-semibold mt-1">{usd(p.val)}</div>
                  <div className="text-white/35 text-[11px]">{p.pct}% of gross</div>
                </div>
              ))}
            </div>

            {/* your share */}
            <div className="rounded-2xl border p-5 mb-6" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4" style={{ color: ACID }} />
                <span className="font-semibold">Your share</span>
                {!d.partner.is_locked && <span className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/30 text-yellow-400">pending activation</span>}
              </div>
              <p className="text-white/55 text-sm mb-4">
                You hold <span className="text-white font-semibold">{d.partner.share_pct}%</span> of the Team pool (the {d.team_pct}% slice). That makes your cut of all-time gross:
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-white/40 text-[11px] uppercase tracking-wide">Earned</div>
                  <div className="text-xl font-semibold mt-0.5">{usd(d.partner.accrued_cents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-[11px] uppercase tracking-wide">Paid out</div>
                  <div className="text-xl font-semibold mt-0.5">{usd(d.partner.paid_cents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-[11px] uppercase tracking-wide">Owed</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: ACID }}>{usd(d.partner.owed_cents)}</div>
                </div>
              </div>
            </div>

            {/* payouts */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Payout history</h2>
              {booksUrl && (
                <a href={booksUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
                  Verify the gross on-chain <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {d.payouts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 px-5 py-8 text-center text-sm text-white/40">No payouts yet.</div>
            ) : (
              <div className="space-y-2">
                {d.payouts.map((p, i) => (
                  <div key={i} className="rounded-xl border border-white/10 p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <span className="font-semibold">{usd(p.amount_cents)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${p.status === "paid" ? "text-green-400 border-green-500/30" : p.status === "pending" ? "text-yellow-400 border-yellow-500/30" : "text-red-400 border-red-500/30"}`}>{p.status}</span>
                    <span className="text-white/35 text-xs">{p.method}</span>
                    {p.tx_signature && (
                      <a href={`https://explorer.solana.com/tx/${p.tx_signature}`} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></a>
                    )}
                    <span className="ml-auto text-[11px] text-white/40">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* change password modal */}
      {showPw && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50" onClick={() => setShowPw(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6" style={{ background: "#101015" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" style={{ color: ACID }} /> Change password</span>
              <button onClick={() => setShowPw(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
              <input type="password" value={nxt} onChange={(e) => setNxt(e.target.value)} placeholder="New password (min 8 chars)"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
              <button onClick={changePw} disabled={pwBusy} className="w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60" style={{ background: ACID, color: "#0a0a0f" }}>
                {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : pwOk ? <Check className="w-4 h-4" /> : null}
                {pwOk ? "Updated" : "Update password"}
              </button>
              {pwMsg && <p className={`text-xs ${pwOk ? "text-green-400" : "text-red-400"}`}>{pwMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
