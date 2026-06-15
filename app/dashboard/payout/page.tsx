"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Trophy, Loader2, Eye, Lock, AlertTriangle, Check, Save, Users, Activity, Crown, FlagOff,
} from "lucide-react"

const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt = (n: number) => Math.round(n || 0).toLocaleString()
const short = (s: string) => (s && s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s)
const ACID = "#c6ff2e", WIN = "#22c55e", GOLD = "#ffc847", RED = "#ef4444"

export default function PayoutPage() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [purse, setPurse] = useState("")
  const [sponsor, setSponsor] = useState("")
  const [openEpoch, setOpenEpoch] = useState("")
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/payout", { cache: "no-store" })
      const j = await r.json()
      setD(j)
      if (j.current) { setPurse(String(j.current.purse || "")); setSponsor(j.current.sponsor || "") }
      if (!j.epoch_active) setOpenEpoch(String((Number(j.epoch) || 0) + 1 || 1))
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

  const doOpen = async () => {
    const e = Number(openEpoch)
    const j = await post("open", { epoch: e, purse: Number(purse) || 0, sponsor })
    if (j) { setMsg(`Week ${e} opened.`); setPreview(null); await load() }
  }
  const doSetPurse = async () => {
    const j = await post("set_purse", { epoch: d.epoch, purse: Number(purse) || 0, sponsor })
    if (j) { setMsg("Purse saved."); await load() }
  }
  const doPreview = async () => { const j = await post("preview", { epoch: d.epoch }); if (j) setPreview(j.preview) }
  const doClose = async () => {
    setConfirmClose(false)
    const j = await post("close", { epoch: d.epoch })
    if (j) { setMsg(`Week ${d.epoch} closed.`); setPreview(null); await load() }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
  if (!d) return <div className="p-10 text-gray-500">Could not load the payout desk.</div>

  const cur = d.current
  const act = d.activation
  const board = d.board
  const effective = (cur?.purse || 0) + (cur?.rollover || 0)

  const Gate = ({ label, value, min, met, icon }: any) => (
    <div className="rounded-xl border bg-gray-900 p-4" style={{ borderColor: met ? "rgba(34,197,94,0.4)" : "#1f2937" }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">{icon}{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums" style={{ color: met ? WIN : "#fff" }}>{fmt(value)}</span>
        <span className="text-sm text-gray-600">/ {fmt(min)}</span>
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: met ? WIN : "#9ca3af" }}>{met ? "met" : "below floor"}</div>
    </div>
  )

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-6 h-6" style={{ color: ACID }} />
        <h1 className="text-2xl font-bold text-white">Payout</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Open a week, set the purse, preview the exact split, then close to pay the holders and reset the board for the next week.</p>

      {msg && <div className="rounded-lg bg-gray-800 text-gray-100 text-sm px-4 py-2 mb-5">{msg}</div>}

      {!d.epoch_active ? (
        /* No live week — open one */
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 mb-6">
          <div className="flex items-center gap-2 text-white font-semibold mb-1"><Trophy className="w-4 h-4" style={{ color: ACID }} /> No week is running</div>
          <p className="text-sm text-gray-500 mb-5">Open a week to start the race. The purse is your prize money for that week, players never see it.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Week number</label>
              <input value={openEpoch} onChange={(e) => setOpenEpoch(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white font-mono" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Purse (USD)</label>
              <input value={purse} onChange={(e) => setPurse(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white font-mono" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Sponsor (optional)</label>
              <input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="—"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white" />
            </div>
          </div>
          <button onClick={doOpen} disabled={busy === "open" || !openEpoch}
            className="mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40" style={{ background: ACID }}>
            {busy === "open" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Open week {openEpoch}
          </button>
        </div>
      ) : (
        <>
          {/* Current week */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">Week {d.epoch}</span>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded" style={{ background: "rgba(198,255,46,0.12)", color: ACID }}>{cur?.status}</span>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Effective purse</div>
                <div className="text-xl font-bold tabular-nums" style={{ color: GOLD }}>{usd(effective)}</div>
                {cur?.rollover > 0 && <div className="text-[11px] text-gray-500">{usd(cur.purse)} + {usd(cur.rollover)} rolled in</div>}
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Purse (USD)</label>
                <input value={purse} onChange={(e) => setPurse(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white font-mono" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Sponsor (optional)</label>
                <input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="—"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white" />
              </div>
              <button onClick={doSetPurse} disabled={busy === "set_purse"}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:text-white disabled:opacity-40">
                {busy === "set_purse" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>

          {/* Live board + activation */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Gate label="Players" value={board.players} min={act.min_players} met={act.players_met} icon={<Users className="w-3.5 h-3.5" />} />
            <Gate label="Plays this week" value={board.plays} min={act.min_plays} met={act.plays_met} icon={<Activity className="w-3.5 h-3.5" />} />
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-500">Total Node Power</div>
              <div className="text-2xl font-bold text-white tabular-nums mt-1">{fmt(board.board_np)}</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500"><Crown className="w-3.5 h-3.5" style={{ color: GOLD }} /> Leader</div>
              <div className="text-lg font-bold text-white mt-1 truncate">{board.leader || "—"}</div>
              {board.leader && <div className="text-[11px] text-gray-500">{fmt(board.leader_np)} NP</div>}
            </div>
          </div>
          <p className="text-[12px] text-gray-500 mb-6 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-gray-600" />
            Below the floor, the week pays nothing and the purse rolls to next week.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button onClick={doPreview} disabled={busy === "preview"}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40" style={{ background: ACID }}>
              {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview the split
            </button>
            <button onClick={() => setConfirmClose(true)} disabled={busy === "close"}
              className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
              style={{ borderColor: "rgba(239,68,68,0.4)", color: RED }}>
              <Lock className="w-4 h-4" /> Close week & pay
            </button>
          </div>

          {/* Preview panel */}
          {preview && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6 mb-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1"><Eye className="w-4 h-4" style={{ color: ACID }} /> Preview</div>
              <p className="text-[12px] text-gray-500 mb-4">Read-only. Nothing has moved. This is exactly what closing would do right now.</p>
              {preview.error ? (
                <div className="text-sm" style={{ color: RED }}>{preview.error}</div>
              ) : preview.would_pay === false ? (
                <div className="rounded-xl border p-4" style={{ borderColor: "rgba(255,200,71,0.35)", background: "rgba(255,200,71,0.05)" }}>
                  <div className="text-sm font-semibold" style={{ color: GOLD }}>Would not pay — below the floor.</div>
                  <div className="text-[13px] text-gray-400 mt-1">
                    {fmt(preview.players)}/{fmt(preview.min_players)} players, {fmt(preview.plays)}/{fmt(preview.min_plays)} plays.
                    The {usd(preview.effective_purse)} purse would roll forward to next week.
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div><div className="text-[11px] uppercase text-gray-500">Pays out</div><div className="text-xl font-bold tabular-nums" style={{ color: WIN }}>{usd(preview.paid_total)}</div></div>
                    <div><div className="text-[11px] uppercase text-gray-500">Rolls forward</div><div className="text-xl font-bold tabular-nums text-white">{usd(preview.rolled_forward)}</div></div>
                    <div><div className="text-[11px] uppercase text-gray-500">Holders paid</div><div className="text-xl font-bold tabular-nums text-white">{fmt(preview.recipients_count)}</div></div>
                    <div><div className="text-[11px] uppercase text-gray-500">Winning faction</div><div className="text-base font-bold text-white truncate">{preview.winner}</div></div>
                  </div>
                  <div className="text-[11px] text-gray-500 mb-3">Skill pot {usd(preview.skill_pot)} · War pot {usd(preview.war_pot)} · Board {fmt(preview.board_np)} NP</div>
                  {Array.isArray(preview.top) && preview.top.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead><tr className="text-gray-500 text-[11px] uppercase">
                          <th className="text-left font-medium py-1.5">Holder</th><th className="text-left font-medium">Faction</th>
                          <th className="text-right font-medium">NP</th><th className="text-right font-medium">Payout</th>
                        </tr></thead>
                        <tbody>
                          {preview.top.map((t: any, i: number) => (
                            <tr key={i} className="border-t border-gray-800">
                              <td className="py-1.5 font-mono text-gray-400">{short(t.user_id)}</td>
                              <td className="text-gray-300">{t.artist_id}</td>
                              <td className="text-right tabular-nums text-gray-400">{fmt(t.np)}</td>
                              <td className="text-right tabular-nums font-semibold" style={{ color: WIN }}>{usd(t.total_cut)}{t.capped ? " *" : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {preview.recipients_count > preview.top.length && <div className="text-[11px] text-gray-600 mt-2">Showing top {preview.top.length} of {fmt(preview.recipients_count)}. * = hit the per-holder cap.</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Recent weeks */}
      {d.recent?.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Settled weeks</h2>
          <div className="space-y-2">
            {d.recent.map((r: any) => (
              <div key={r.epoch} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex items-center gap-4">
                <div className="text-sm font-bold text-white">Week {r.epoch}</div>
                <div className="flex-1 text-[12px] text-gray-500">
                  {r.status === "paid" ? <>paid {usd(r.paid_total)}{r.winner ? ` · ${r.winner} won` : ""}</> : <>rolled forward (below floor)</>}
                  {r.snapshot_at ? ` · ${new Date(r.snapshot_at).toLocaleDateString()}` : ""}
                </div>
                <span className="text-[11px] font-mono uppercase" style={{ color: r.status === "paid" ? WIN : GOLD }}>{r.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Close confirm */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmClose(false)}>
          <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-white font-bold mb-2"><AlertTriangle className="w-5 h-5" style={{ color: RED }} /> Close week {d.epoch}?</div>
            <p className="text-[13px] text-gray-400 mb-1">
              This computes the payout and writes every holder's winnings, then wipes Node Power and starts week {d.epoch + 1} fresh.
            </p>
            {preview && preview.would_pay && <p className="text-[13px] text-gray-300 mb-1">It will pay <span style={{ color: WIN }}>{usd(preview.paid_total)}</span> to <span className="text-white">{fmt(preview.recipients_count)}</span> holders.</p>}
            {preview && preview.would_pay === false && <p className="text-[13px]" style={{ color: GOLD }}>Below the floor — it will pay nothing and roll the purse forward.</p>}
            <p className="text-[12px] text-gray-500 mb-5">This cannot be undone. Winnings become withdrawable immediately.</p>
            <div className="flex gap-3">
              <button onClick={doClose} className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white" style={{ background: RED }}>Close & pay</button>
              <button onClick={() => setConfirmClose(false)} className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
