"use client"

import { useState, useEffect, useCallback } from "react"
import { Zap, Loader2, Eye, AlertTriangle, Check, Save, Users, Activity, Crown, Gauge } from "lucide-react"

const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usd0 = (n: number) => `$${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
const fmt = (n: number) => Math.round(n || 0).toLocaleString()
const short = (s: string) => (s && s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s)
const ACID = "#c6ff2e", WIN = "#22c55e", GOLD = "#ffc847", RED = "#ef4444"

export default function PayoutPage() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pool, setPool] = useState("")
  const [target, setTarget] = useState("")
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState("")
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [msg, setMsg] = useState("")
  const [released, setReleased] = useState<any>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/payout", { cache: "no-store" })
      const j = await r.json()
      setD(j)
      if (j.drop) {
        setPool(String(j.drop.season_pool ?? ""))
        setTarget(String(j.drop.target ?? ""))
      }
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (action: string, extra: any = {}) => {
    setBusy(action); setMsg("")
    try {
      const r = await fetch("/api/admin/payout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (!r.ok || j.error) { setMsg(j.error || "Failed."); return null }
      return j
    } catch { setMsg("Network error."); return null } finally { setBusy("") }
  }

  const saveDial = async (action: string, value: number, label: string) => {
    const j = await post(action, { value })
    if (j) { setMsg(`${label} saved.`); await load() }
  }
  const doPreview = async () => {
    const j = await post("preview", {})
    if (j) setPreview(j.preview)
  }
  const doRelease = async () => {
    setConfirmRelease(false)
    const j = await post("release", {})
    if (j) { setReleased(j.result); setPreview(null); setMsg(""); await load() }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: ACID }} /></div>

  const drop = d?.drop
  const prize = Number(drop?.season_pool) || 0
  const revenue = Number(drop?.accrued) || 0
  const pct = Math.min(100, Math.max(0, Math.round(Number(drop?.momentum_pct) || 0)))

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5" style={{ color: GOLD }} />
          <h1 className="text-xl font-bold text-white">Drop Desk</h1>
        </div>
        <div className="font-mono text-xs text-white/50 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: WIN }} />
          LIVE · DROP {drop?.number ?? 1}
        </div>
      </div>

      {msg && <div className="rounded-lg px-3 py-2 text-sm font-mono" style={{ background: "rgba(34,197,94,0.1)", color: WIN }}>{msg}</div>}

      {/* the real money */}
      <div className="rounded-2xl p-5 border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/40 mb-3">What a drop pays right now</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-[10px] text-white/40 uppercase">Prize (paid)</div>
            <div className="text-2xl font-bold" style={{ color: GOLD }}>{usd(prize)}</div>
            <div className="font-mono text-[10px] text-white/30">you fund this</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-white/40 uppercase">Revenue</div>
            <div className="text-2xl font-bold" style={{ color: WIN }}>{usd(revenue)}</div>
            <div className="font-mono text-[10px] text-white/30">yours · since last drop</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-white/40 uppercase">Target</div>
            <div className="text-2xl font-bold text-white">{usd(Number(drop?.target) || 0)}</div>
            <div className="font-mono text-[10px] text-white/30">fills the bar</div>
          </div>
        </div>

        {/* momentum */}
        <div className="mt-4">
          <div className="flex justify-between font-mono text-[11px] text-white/40 mb-1">
            <span>Revenue to next drop</span>
            <span className="text-white/70">{usd(revenue)} / {usd(Number(drop?.target) || 0)} · {pct}%</span>
          </div>
          <div className="h-2.5 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-md transition-[width]" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#c6ff2e,#ffc847)" }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10 font-mono text-xs">
          <div className="flex items-center gap-1.5 text-white/60"><Users className="w-3.5 h-3.5" />{drop?.holders ?? 0} holders</div>
          <div className="flex items-center gap-1.5 text-white/60"><Activity className="w-3.5 h-3.5" />{fmt(drop?.board_np || 0)} NP</div>
          <div className="flex items-center gap-1.5 text-white/60"><Crown className="w-3.5 h-3.5" style={{ color: GOLD }} />{d?.leader?.name || "—"}</div>
        </div>
      </div>

      {/* dials */}
      <div className="rounded-2xl p-5 border border-white/10 space-y-4" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/40 flex items-center gap-2"><Gauge className="w-3.5 h-3.5" />Dials</div>

        {[
          { label: "Drop prize", hint: "what the drop pays · the hero players see · funded by you", val: pool, set: setPool, action: "set_pool", icon: "$" },
          { label: "Drop target", hint: "revenue that fills the bar and cues the drop", val: target, set: setTarget, action: "set_target", icon: "$" },
        ].map((row) => (
          <div key={row.action} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-white font-medium">{row.label}</div>
              <div className="font-mono text-[10px] text-white/40">{row.hint}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/40 font-mono text-sm">{row.icon}</span>
              <input value={row.val} onChange={(e) => row.set(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-24 bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5 text-white font-mono text-sm text-right focus:outline-none focus:border-white/40"
                inputMode="decimal" />
              <button onClick={() => saveDial(row.action, Number(row.val) || 0, row.label)} disabled={busy === row.action}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                style={{ background: "rgba(198,255,46,0.12)", color: ACID }}>
                {busy === row.action ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* preview + release */}
      <div className="rounded-2xl p-5 border border-white/10 space-y-4" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/40">Release a drop</div>
          <button onClick={doPreview} disabled={busy === "preview"}
            className="rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}>
            {busy === "preview" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}Preview
          </button>
        </div>

        {preview && (
          <div className="rounded-xl p-4 border border-white/10 space-y-3" style={{ background: "rgba(0,0,0,0.3)" }}>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div><span className="text-white/40">Pool</span><div className="text-base font-bold" style={{ color: GOLD }}>{usd(preview.pool_usd)}</div></div>
              <div><span className="text-white/40">Pays out</span><div className="text-base font-bold" style={{ color: WIN }}>{usd(preview.paid_total)}</div></div>
              <div><span className="text-white/40">Recipients</span><div className="text-base font-bold text-white">{preview.recipients}</div></div>
            </div>
            {Number(preview.rolled_forward) > 0 && <div className="font-mono text-[10px] text-white/40">{usd(preview.rolled_forward)} stays in the pool (sub-cent dust unpaid)</div>}
            {Array.isArray(preview.top) && preview.top.length > 0 && (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                <div className="grid grid-cols-4 font-mono text-[10px] text-white/30 uppercase pb-1 border-b border-white/10">
                  <span>Holder</span><span className="text-right">NP</span><span className="text-right">Boost</span><span className="text-right">Payout</span>
                </div>
                {preview.top.map((t: any, i: number) => (
                  <div key={i} className="grid grid-cols-4 font-mono text-[11px] text-white/70 py-0.5">
                    <span>{short(t.user_id)}</span>
                    <span className="text-right">{fmt(t.np)}</span>
                    <span className="text-right" style={{ color: Number(t.mult) > 1 ? ACID : "rgba(255,255,255,0.4)" }}>{Number(t.mult).toFixed(2)}×</span>
                    <span className="text-right font-bold" style={{ color: WIN }}>{usd(t.payout)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {released && (
          <div className="rounded-xl p-4 border" style={{ background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.3)" }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: WIN }}><Check className="w-4 h-4" />Drop {released.drop} released</div>
            <div className="font-mono text-xs text-white/60 mt-1">Paid {usd(released.paid_total)} to {released.recipients} holders. Now on drop {released.next_drop}. Bar reset.</div>
          </div>
        )}

        {!confirmRelease ? (
          <button onClick={() => { setConfirmRelease(true); setReleased(null) }} disabled={prize <= 0 || (drop?.holders ?? 0) === 0}
            className="w-full rounded-xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: GOLD, color: "#1a1300" }}>
            <Zap className="w-4 h-4" />Release drop {drop?.number ?? 1} · {usd(prize)}
          </button>
        ) : (
          <div className="rounded-xl p-4 border space-y-3" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.3)" }}>
            <div className="flex items-start gap-2 text-sm" style={{ color: RED }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>This pays {usd(prize)} to {drop?.holders} holders and credits their cash-out balance. Positions stay. This can't be undone.</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRelease(false)} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white/70" style={{ background: "rgba(255,255,255,0.06)" }}>Cancel</button>
              <button onClick={doRelease} disabled={busy === "release"} className="flex-1 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: RED, color: "#fff" }}>
                {busy === "release" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}Yes, release
              </button>
            </div>
          </div>
        )}
      </div>

      {/* recent drops */}
      {Array.isArray(d?.recent) && d.recent.length > 0 && (
        <div className="rounded-2xl p-5 border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/40 mb-3">Recent drops</div>
          <div className="space-y-1">
            <div className="grid grid-cols-4 font-mono text-[10px] text-white/30 uppercase pb-1 border-b border-white/10">
              <span>Drop</span><span className="text-right">Pool</span><span className="text-right">Paid</span><span className="text-right">Holders</span>
            </div>
            {d.recent.map((r: any) => (
              <div key={r.drop} className="grid grid-cols-4 font-mono text-xs text-white/70 py-1">
                <span className="text-white">#{r.drop}</span>
                <span className="text-right">{usd0(r.pool)}</span>
                <span className="text-right" style={{ color: WIN }}>{usd0(r.paid_total)}</span>
                <span className="text-right">{r.recipients}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
