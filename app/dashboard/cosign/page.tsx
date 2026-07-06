"use client"

/**
 * /dashboard/cosign — Co-Sign Desk (artist model).
 *
 * Set this week's cash pool + Spins pot + sponsor (name & link), watch the
 * live artist race (artists by total combined streams with call counts), and
 * see the settlement preview: what the current #1 artist's callers would win if
 * it settled now (decay-weighted, earlier callers more). Below: settled-week
 * history and a by-hand settle for a specific week. Settlement runs weekly
 * Monday 00:05 UTC.
 */

import { useEffect, useState } from "react"
import { PenLine, Loader2, Save, Check, Trophy, PlayCircle } from "lucide-react"

type Race = { rank: number; artist: string; streams: number; calls: number }
type Preview = { winner_artist?: string; callers: number; currency?: string; total_paid: number; top?: { seq: number; pct: number }[] }
type Hist = { week_start: string; sponsor: string | null; total_pool_value: number; currency: string }
type Pool = { sponsor: string | null; sponsor_url: string | null; currency: string; token_mint: string | null; total_pool_value: number; spins_pot: number; status: string }
type Data = { week_start: string; pool: Pool | null; race: Race[]; preview: Preview; history: Hist[] }

const fmt = (n: number) => (n || 0).toLocaleString("en-US")
const fmtV = (n: number) => (Number.isInteger(n) ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString("en-US"))
const curLabel = (c?: string) => (c === "usdc" ? "USDC" : c === "spins" ? "Spins" : "TOKEN")

export default function CoSignDeskPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [currency, setCurrency] = useState<"usdc" | "token">("usdc")
  const [sponsor, setSponsor] = useState("")
  const [sponsorUrl, setSponsorUrl] = useState("")
  const [mint, setMint] = useState("")
  const [poolVal, setPoolVal] = useState("")
  const [spinsPot, setSpinsPot] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [week, setWeek] = useState("")
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState("")

  const load = () => {
    setLoading(true); setErr("")
    fetch("/api/admin/cosign", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      if (data.error) { setErr(data.error); return }
      setD(data)
      if (data.pool) {
        setCurrency(data.pool.currency === "token" ? "token" : "usdc")
        setSponsor(data.pool.sponsor || ""); setSponsorUrl(data.pool.sponsor_url || "")
        setMint(data.pool.token_mint || "")
        setPoolVal(String(data.pool.total_pool_value || "")); setSpinsPot(String(data.pool.spins_pot || ""))
      }
    }).catch(() => setErr("Could not reach the server")).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const savePool = async () => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/admin/cosign/pool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reward_currency: currency, token_mint: currency === "token" ? mint : undefined,
          sponsor_name: sponsor, sponsor_url: sponsorUrl,
          total_pool_value: Number(poolVal), spins_pot: Number(spinsPot),
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not save"); return }
      setSaved(true); setTimeout(() => setSaved(false), 1800); load()
    } catch { setErr("Could not save") } finally { setSaving(false) }
  }

  const settle = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) { setSettleMsg("Enter that week's Monday, YYYY-MM-DD"); return }
    setSettling(true); setSettleMsg("")
    try {
      const res = await fetch("/api/admin/cosign/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week }) })
      const j = await res.json()
      if (!res.ok) { setSettleMsg(j.error || "Settle failed"); return }
      const r = j.result || {}
      setSettleMsg(r.ok === false ? "Already settled or no pool" : `Settled: ${r.cash_winners ?? 0} cash winners, ${r.spins_recipients ?? 0} got Spins`)
      load()
    } catch { setSettleMsg("Settle failed") } finally { setSettling(false) }
  }

  const input = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
  const label = "block text-xs text-gray-400 mb-1.5"

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6"><PenLine className="w-6 h-6 text-primary" /><h1 className="text-xl font-bold text-white">Co-Sign Desk</h1>{d && <span className="text-xs text-gray-500 ml-2">week of {d.week_start}</span>}</div>
      {err && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {/* What's live right now — persistent, not a flash */}
      <div className={`mb-4 rounded-lg px-4 py-3 text-sm border ${d?.pool ? "border-primary/40 bg-primary/5 text-white" : "border-gray-800 bg-gray-900 text-gray-400"}`}>
        {d?.pool ? (
          <>
            <span className="text-primary font-semibold">POOL LIVE</span> for week of {d.week_start} — {fmtV(d.pool.total_pool_value)} {curLabel(d.pool.currency)} cash + {fmt(d.pool.spins_pot)} Spins
            {d.pool.sponsor ? <> · powered by <span className="text-primary">{d.pool.sponsor}</span></> : null}
            {d.pool.sponsor_url ? <> · <a href={d.pool.sponsor_url} target="_blank" rel="noopener noreferrer" className="underline text-primary">link ↗</a></> : null}
            <span className="text-gray-500"> · calls are open in the app</span>
          </>
        ) : (
          <>No pool set for this week — calls are CLOSED in the app until you save one below.</>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pool setter */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Save className="w-4 h-4 text-primary" /> This week's reward</div>
          <div className="mb-3">
            <label className={label}>Cash prize currency</label>
            <div className="flex gap-1.5 bg-gray-950 border border-gray-800 rounded-lg p-1">
              {(["usdc", "token"] as const).map((c) => (
                <button key={c} onClick={() => setCurrency(c)} className={`flex-1 text-xs py-2 rounded-md font-semibold ${currency === c ? "bg-primary text-gray-950" : "text-gray-400"}`}>{c === "usdc" ? "USDC" : "Sponsor token"}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Sponsor name</label><input className={input} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Coinbase" /></div>
            <div><label className={label}>Sponsor link</label><input className={input} value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://..." /></div>
            {currency === "token" && <div className="col-span-2"><label className={label}>Token mint</label><input className={input} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="mint address" /></div>}
            <div><label className={label}>Cash pool ({curLabel(currency)})</label><input className={input} value={poolVal} onChange={(e) => setPoolVal(e.target.value)} inputMode="decimal" placeholder="10000" /></div>
            <div><label className={label}>Spins consolation pot</label><input className={input} value={spinsPot} onChange={(e) => setSpinsPot(e.target.value)} inputMode="numeric" placeholder="10000" /></div>
          </div>
          <button onClick={savePool} disabled={saving} className="mt-4 w-full bg-primary text-gray-950 font-semibold text-sm py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}{saved ? "Saved" : "Save pool"}
          </button>
          <p className="text-[11px] text-gray-600 mt-2">Callers of the #1 artist split the cash by call order (earlier = more). Everyone else who called gets Spins.</p>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><Trophy className="w-4 h-4 text-primary" /> If it settled now</div>
          {d?.preview?.winner_artist ? (
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm"><span className="text-gray-400">#1 artist</span><span className="text-white font-medium">{d.preview.winner_artist}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Callers</span><span className="text-white font-mono">{d.preview.callers}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Cash pool</span><span className="text-primary font-mono font-bold">{fmtV(d.preview.total_paid)} {curLabel(d.preview.currency)}</span></div>
              {d.preview.top && d.preview.top.length > 0 && (
                <div className="pt-2 border-t border-gray-800 space-y-1">
                  <div className="text-[11px] text-gray-500 mb-1">Top callers' cut</div>
                  {d.preview.top.map((t) => (
                    <div key={t.seq} className="flex justify-between text-xs"><span className="text-gray-400">#{t.seq}</span><span className="text-white font-mono">{t.pct.toFixed(1)}% · {fmtV((t.pct / 100) * d.preview.total_paid)} {curLabel(d.preview.currency)}</span></div>
                  ))}
                </div>
              )}
            </div>
          ) : <p className="text-sm text-gray-500 py-6 text-center">No streams yet this week.</p>}
        </div>
      </div>

      {/* Race */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-white font-semibold mb-4">Live race · artists by total streams</div>
        {!d || d.race.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No plays yet this week.</p> : (
          <div className="space-y-1.5">
            {d.race.map((r) => (
              <div key={r.artist} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                <span className={`font-mono text-sm w-6 text-center ${r.rank === 1 ? "text-primary font-bold" : "text-gray-500"}`}>{String(r.rank).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{r.artist}</div></div>
                <div className="text-right"><div className="text-sm text-white font-mono">{fmt(r.streams)}</div><div className="text-[10px] text-gray-600">streams</div></div>
                <div className="text-right w-16"><div className="text-sm font-mono text-purple-400">{fmt(r.calls)}</div><div className="text-[10px] text-gray-600">called</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History + settle */}
      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="text-white font-semibold mb-4">Settled weeks</div>
          {!d || d.history.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Nothing settled yet.</p> : (
            <div className="space-y-2">
              {d.history.map((h) => (
                <div key={h.week_start} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
                  <div><div className="text-sm text-white">{h.sponsor || "—"}</div><div className="text-[11px] text-gray-500">week of {h.week_start}</div></div>
                  <div className="text-right"><div className="text-sm font-mono text-primary">{fmtV(h.total_pool_value)}</div><div className="text-[10px] text-gray-600">{curLabel(h.currency)}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-white font-semibold mb-4"><PlayCircle className="w-4 h-4 text-primary" /> Settle by hand</div>
          <p className="text-[12px] text-gray-500 mb-3">Runs weekly on its own. Use this only to settle a specific past week (its Monday) for testing or a missed run.</p>
          <label className={label}>Week (Monday, UTC)</label>
          <input className={input} value={week} onChange={(e) => setWeek(e.target.value)} placeholder="2026-06-29" />
          <button onClick={settle} disabled={settling} className="mt-3 w-full border border-gray-700 text-white font-semibold text-sm py-2.5 rounded-lg hover:border-primary/60 disabled:opacity-50 flex items-center justify-center gap-2">
            {settling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Settle week
          </button>
          {settleMsg && <div className="mt-3 text-sm text-gray-300">{settleMsg}</div>}
        </div>
      </div>
    </div>
  )
}
