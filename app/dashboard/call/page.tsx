"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Plus, Lock, AlertTriangle, Trash2 } from "lucide-react"

/**
 * THE CALL DESK.
 *
 * The board here shows raw counted plays. The player's chart shows rank and a
 * direction word and nothing else, and that asymmetry is the point: the
 * operator has to see the numbers to run the thing, and the room must not,
 * because a visible gap is a minimum-effort calculator.
 *
 * Tickets stay dark while the window is open, enforced server-side. Reading
 * the room's calls before the window shuts is the insider risk that §17 says
 * is the only one that could end this.
 */

type Session = {
  id: number
  session_no: number
  status: string
  call_opens_at: string
  call_closes_at: string
  week_starts_at: string
  week_ends_at: string
  recovery_fund_usdc: number
  spins_pot_carry: number
  rolled_from_session: number | null
  settled_at: string | null
  winner_summary: Record<string, unknown> | null
}

type ChartRow = { rank: number; track_id: number; title: string; artist: string; counted: number }
type Ticket = {
  id: number; user_id: string
  pick_1: number; pick_2: number; pick_3: number; pick_4: number; pick_5: number
  spins_paid: number; tier_won: string | null; spins_won: number; fund_share_usd: number
}
type Knobs = {
  call_enabled: boolean
  call_ticket_price: number
  call_daily_price: number
  call_tickets_per_user: number
  call_play_cap: number
  call_daily_floor: number
  call_tier_pct: Record<string, number>
  ammo_per_usd: string | number | null
}

type DailyDay = {
  day: string
  status: string
  closes_at: string
  resolves_at: string
  answer_track_id: number | null
  answer: { title: string; artist: string } | null
  pot_carry: number
  entries: number
  summary: Record<string, unknown> | null
}

const forInput = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "")
const short = (iso: string | null) =>
  iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not set"

const TIER_LABEL: Record<string, string> = {
  full_recovery: "FULL RECOVERY",
  remission: "REMISSION",
  breakthrough: "BREAKTHROUGH",
  progress: "PROGRESS",
}

export default function CallDeskPage() {
  const [data, setData] = useState<{
    sessions: Session[]; focus: number; knobs: Knobs; chart: ChartRow[]
    tickets: Ticket[]; tickets_sealed: boolean; pot_spins: number; catalogue_size: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null)
  const [focus, setFocus] = useState<number>(0)
  const [form, setForm] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [knobDraft, setKnobDraft] = useState<Knobs | null>(null)
  const [tab, setTab] = useState<"call" | "daily" | "artist">("call")
  const [daily, setDaily] = useState<DailyDay[] | null>(null)
  const [dailyBusy, setDailyBusy] = useState<string | null>(null)

  const loadDaily = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/call/daily", { cache: "no-store" })
      const body = await res.json()
      if (res.ok) setDaily(body.days || [])
    } catch { /* soft */ }
  }, [])

  const dailyAction = async (action: "open" | "resolve", day?: string) => {
    setDailyBusy(action); setMsg(null)
    try {
      const method = action === "open" ? "POST" : "PATCH"
      const res = await fetch("/api/admin/call/daily", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, day }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Failed")
      setMsg({ text: action === "open" ? "Day opened." : `Resolved. ${JSON.stringify(r.result)}`, err: false })
      await loadDaily()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally { setDailyBusy(null) }
  }

  const load = useCallback(async (sessionId?: number) => {
    setLoading(true)
    try {
      const q = sessionId ? `?session=${sessionId}` : ""
      const res = await fetch(`/api/admin/call${q}`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed")
      setData(body)
      setFocus(body.focus)
      if (!knobDraft) setKnobDraft(body.knobs)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally {
      setLoading(false)
    }
  }, [knobDraft])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = async () => {
    setBusy("session"); setMsg(null)
    try {
      const body: Record<string, unknown> = {
        session_no: Number(form.session_no),
        call_opens_at: form.call_opens_at ? new Date(form.call_opens_at + "Z").toISOString() : "",
        call_closes_at: form.call_closes_at ? new Date(form.call_closes_at + "Z").toISOString() : "",
        week_starts_at: form.week_starts_at ? new Date(form.week_starts_at + "Z").toISOString() : "",
        week_ends_at: form.week_ends_at ? new Date(form.week_ends_at + "Z").toISOString() : "",
        recovery_fund_usdc: Number(form.recovery_fund_usdc || 0),
      }
      if (editing) body.id = editing
      const res = await fetch("/api/admin/call", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Failed")
      setMsg({ text: editing ? "Session updated." : "Session created.", err: false })
      setForm({}); setEditing(null)
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally { setBusy(null) }
  }

  const settle = async (s: Session) => {
    const typed = prompt(`Settle session ${s.session_no}? This pays the pot and queues the Recovery Fund. Type SETTLE to confirm.`)
    if (typed !== "SETTLE") return
    setBusy("settle"); setMsg(null)
    try {
      const res = await fetch("/api/admin/call", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", id: s.id }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Failed")
      const x = r.result || {}
      setMsg({
        text: `Settled. Pot ${x.pot_spins}, paid ${x.paid_spins}, rolled ${x.rolled_spins}. Full recovery winners: ${x.full_recovery_winners}.`,
        err: false,
      })
      await load(s.id)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally { setBusy(null) }
  }

  const scrap = async (s: Session) => {
    if (!confirm(`Scrap session ${s.session_no}? Every ticket is refunded in full.`)) return
    setBusy("scrap")
    try {
      const res = await fetch(`/api/admin/call?id=${s.id}`, { method: "DELETE" })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Failed")
      setMsg({ text: `Scrapped. ${r.tickets} tickets refunded, ${r.refunded} Spins back.`, err: false })
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally { setBusy(null) }
  }

  const saveKnobs = async () => {
    if (!knobDraft) return
    setBusy("knobs"); setMsg(null)
    try {
      const res = await fetch("/api/admin/call", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "knobs", ...knobDraft }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Failed")
      setMsg({ text: "Knobs saved.", err: false })
      await load(focus)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", err: true })
    } finally { setBusy(null) }
  }

  if (loading && !data) {
    return <div className="p-8 flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading the desk</div>
  }

  const k = knobDraft
  const focusSession = data?.sessions.find((s) => s.id === focus)
  const tierSum = k ? Object.values(k.call_tier_pct || {}).reduce((a, b) => a + Number(b || 0), 0) : 0

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">The Call Desk</h1>
          <p className="text-sm text-gray-400">
            Catalogue: {data?.catalogue_size ?? 0} tracks on the chart. The player never sees a count. You do.
          </p>
        </div>
        <Button variant="outline" onClick={() => load(focus)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {msg && (
        <div className={`text-sm rounded p-3 ${msg.err ? "bg-red-950 text-red-300" : "bg-emerald-950 text-emerald-300"}`}>
          {msg.text}
        </div>
      )}

      {k && !k.call_enabled && (
        <div className="text-sm rounded p-3 bg-amber-950 text-amber-300 flex items-center gap-2">
          <Lock className="h-4 w-4" /> call_enabled is false. Nobody can book a session. The page still counts down.
        </div>
      )}

      {k && (k.ammo_per_usd === null || Number(k.ammo_per_usd) !== 20) && (
        <div className="text-sm rounded p-3 bg-red-950 text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          ammo_per_usd reads {k.ammo_per_usd === null ? "NOT SET" : String(k.ammo_per_usd)}. It has to be 20 before payments go on,
          or the buy screen sells 100 Spins a dollar and the play cap stops meaning one dollar.
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-800">
        {([["call", "The Call"], ["daily", "The Daily"], ["artist", "The Artist"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); if (id === "daily" && !daily) loadDaily() }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === id ? "border-lime-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "call" && (<>
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Sessions</CardTitle>
          <CardDescription>Sessions open automatically each day. Today calls tomorrow’s chart. You rarely need to make one by hand.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.sessions || []).map((s) => (
            <div
              key={s.id}
              className={`p-3 rounded border ${s.id === focus ? "border-lime-600 bg-gray-950" : "border-gray-800"}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button className="text-left" onClick={() => load(s.id)}>
                  <span className="text-white font-medium">Session {s.session_no}</span>
                  <Badge className="ml-2" variant={s.status === "settled" ? "secondary" : "default"}>{s.status}</Badge>
                  <span className="ml-3 text-xs text-gray-500">
                    calls {short(s.call_opens_at)} to {short(s.call_closes_at)} · chart day {short(s.week_starts_at)} to {short(s.week_ends_at)}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-lime-400">${Number(s.recovery_fund_usdc).toLocaleString()}</span>
                  {s.spins_pot_carry > 0 && (
                    <span className="text-xs text-amber-400">+{s.spins_pot_carry} carried</span>
                  )}
                  {s.status !== "settled" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditing(s.id)
                        setForm({
                          session_no: String(s.session_no),
                          call_opens_at: forInput(s.call_opens_at),
                          call_closes_at: forInput(s.call_closes_at),
                          week_starts_at: forInput(s.week_starts_at),
                          week_ends_at: forInput(s.week_ends_at),
                          recovery_fund_usdc: String(s.recovery_fund_usdc),
                        })
                      }}>Edit</Button>
                      <Button size="sm" variant="outline" disabled={busy === "settle"} onClick={() => settle(s)}>Settle</Button>
                      <Button size="sm" variant="outline" disabled={busy === "scrap"} onClick={() => scrap(s)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {s.winner_summary && (
                <div className="mt-2 text-xs text-gray-400">
                  top five {JSON.stringify((s.winner_summary as { top5?: number[] }).top5)} · pot{" "}
                  {String((s.winner_summary as { pot_spins?: number }).pot_spins)} · rolled{" "}
                  {String((s.winner_summary as { rolled_spins?: number }).rolled_spins)} ·{" "}
                  {(s.winner_summary as { fund_rolls?: boolean }).fund_rolls
                    ? "nobody recovered, the fund doubled"
                    : `${String((s.winner_summary as { full_recovery_winners?: number }).full_recovery_winners)} recovered`}
                </div>
              )}
            </div>
          ))}
          {!data?.sessions.length && <p className="text-sm text-gray-500">No sessions yet.</p>}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Plus className="h-4 w-4" /> {editing ? `Edit session ${form.session_no}` : "New session"}
          </CardTitle>
          <CardDescription>All times UTC. Calling must close before the chart day starts, or somebody calls with information. Normally the daily cron handles this.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">Session number
              <Input type="number" value={form.session_no || ""} disabled={!!editing}
                onChange={(e) => setForm({ ...form, session_no: e.target.value })} />
            </label>
            <label className="text-xs text-gray-400">Recovery Fund, USDC
              <Input type="number" value={form.recovery_fund_usdc || ""}
                onChange={(e) => setForm({ ...form, recovery_fund_usdc: e.target.value })} />
            </label>
            <label className="text-xs text-gray-400">Calling opens
              <Input type="datetime-local" value={form.call_opens_at || ""}
                onChange={(e) => setForm({ ...form, call_opens_at: e.target.value })} />
            </label>
            <label className="text-xs text-gray-400">Calling closes
              <Input type="datetime-local" value={form.call_closes_at || ""}
                onChange={(e) => setForm({ ...form, call_closes_at: e.target.value })} />
            </label>
            <label className="text-xs text-gray-400">Chart day starts
              <Input type="datetime-local" value={form.week_starts_at || ""}
                onChange={(e) => setForm({ ...form, week_starts_at: e.target.value })} />
            </label>
            <label className="text-xs text-gray-400">Chart day ends
              <Input type="datetime-local" value={form.week_ends_at || ""}
                onChange={(e) => setForm({ ...form, week_ends_at: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveSession} disabled={busy === "session"}>
              {busy === "session" ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Create"}
            </Button>
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm({}) }}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">
            The board {focusSession ? `· session ${focusSession.session_no}` : ""}
          </CardTitle>
          <CardDescription>
            Raw counted plays. Payer-only, capped at {k?.call_play_cap ?? 20} per user per track
            {k && k.call_play_cap <= 0 ? " (cap off, everything counts)" : ""}. Pot: {data?.pot_spins ?? 0} Spins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(data?.chart || []).slice(0, 20).map((r) => (
              <div key={r.track_id} className={`flex items-center justify-between text-sm py-1 ${r.rank <= 5 ? "text-lime-400" : "text-gray-400"}`}>
                <span className="w-8 tabular-nums">{r.rank}</span>
                <span className="flex-1 truncate">{r.title}</span>
                <span className="w-40 truncate text-gray-500 text-xs">{r.artist}</span>
                <span className="w-16 text-right tabular-nums">{r.counted}</span>
              </div>
            ))}
            {!data?.chart.length && <p className="text-sm text-gray-500">Nothing counted in this window yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Tickets</CardTitle>
          <CardDescription>
            {data?.tickets_sealed
              ? "Sealed while the window is open. You do not get to read the room's calls before it closes either."
              : `${data?.tickets.length ?? 0} booked.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.tickets_sealed ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Lock className="h-4 w-4" /> Sealed</div>
          ) : (
            <div className="space-y-1">
              {(data?.tickets || []).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm text-gray-400 py-1">
                  <span className="w-24 truncate text-xs text-gray-600">{t.user_id.slice(0, 8)}</span>
                  <span className="flex-1 tabular-nums">
                    {[t.pick_1, t.pick_2, t.pick_3, t.pick_4, t.pick_5].join(" · ")}
                  </span>
                  <span className="w-36 text-right text-xs">
                    {t.tier_won ? (
                      <span className="text-lime-400">{TIER_LABEL[t.tier_won]} +{t.spins_won}</span>
                    ) : <span className="text-gray-600">no tier</span>}
                  </span>
                  <span className="w-20 text-right text-xs text-lime-400">
                    {Number(t.fund_share_usd) > 0 ? `$${Number(t.fund_share_usd)}` : ""}
                  </span>
                </div>
              ))}
              {!data?.tickets.length && <p className="text-sm text-gray-500">Nobody has called yet.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {k && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Knobs</CardTitle>
            <CardDescription>Live config. No deploy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="text-xs text-gray-400">Ticket price
                <Input type="number" value={k.call_ticket_price}
                  onChange={(e) => setKnobDraft({ ...k, call_ticket_price: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-gray-400">Daily price
                <Input type="number" value={k.call_daily_price}
                  onChange={(e) => setKnobDraft({ ...k, call_daily_price: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-gray-400">Tickets per user
                <Input type="number" value={k.call_tickets_per_user}
                  onChange={(e) => setKnobDraft({ ...k, call_tickets_per_user: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-gray-400">Play cap (0 = off)
                <Input type="number" value={k.call_play_cap}
                  onChange={(e) => setKnobDraft({ ...k, call_play_cap: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-gray-400">Daily floor
                <Input type="number" value={k.call_daily_floor}
                  onChange={(e) => setKnobDraft({ ...k, call_daily_floor: Number(e.target.value) })} />
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["full_recovery", "remission", "breakthrough", "progress"].map((t) => (
                <label key={t} className="text-xs text-gray-400">{TIER_LABEL[t]} %
                  <Input type="number" value={k.call_tier_pct?.[t] ?? 0}
                    onChange={(e) => setKnobDraft({ ...k, call_tier_pct: { ...k.call_tier_pct, [t]: Number(e.target.value) } })} />
                </label>
              ))}
            </div>
            <p className={`text-xs ${tierSum > 100 ? "text-red-400" : "text-gray-500"}`}>
              Splits add to {tierSum}%. Anything left over rolls, along with every tier nobody won.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={saveKnobs} disabled={busy === "knobs" || tierSum > 100}>
                {busy === "knobs" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save knobs"}
              </Button>
              <Button
                variant={k.call_enabled ? "destructive" : "default"}
                onClick={() => { setKnobDraft({ ...k, call_enabled: !k.call_enabled }); }}
              >
                {k.call_enabled ? "Switch The Call off" : "Switch The Call on"}
              </Button>
              <span className="text-xs text-gray-500">
                Read inside the entry function, not the UI. It is a real switch.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
      </>)}

      {tab === "daily" && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">The Daily</CardTitle>
            <CardDescription>
              Call tomorrow&apos;s number three. The crons open tomorrow at 00:01 UTC and resolve yesterday at 00:06.
              These are the manual overrides. Pays the coin once it is wired; Spins until then.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={() => dailyAction("open")} disabled={dailyBusy === "open"}>
                {dailyBusy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open tomorrow now"}
              </Button>
              <Button variant="outline" onClick={loadDaily} disabled={!!dailyBusy}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>

            <div className="space-y-1">
              {(daily || []).map((d) => (
                <div key={d.day} className="p-3 rounded border border-gray-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-white font-medium">{d.day}</span>
                    <Badge className="ml-2" variant={d.status === "settled" ? "secondary" : d.status === "void" ? "outline" : "default"}>{d.status}</Badge>
                    <span className="ml-3 text-xs text-gray-500">
                      {d.entries} {d.entries === 1 ? "call" : "calls"}
                      {d.pot_carry > 0 ? ` · +${d.pot_carry} carried` : ""}
                      {d.answer ? ` · answer: ${d.answer.title}` : ""}
                    </span>
                  </div>
                  {(d.status === "running" || d.status === "open") && new Date(d.resolves_at).getTime() < Date.now() && (
                    <Button size="sm" variant="outline" disabled={dailyBusy === "resolve"} onClick={() => dailyAction("resolve", d.day)}>
                      Resolve now
                    </Button>
                  )}
                </div>
              ))}
              {daily && !daily.length && <p className="text-sm text-gray-500">No days yet. Open tomorrow to start, or wait for the cron.</p>}
              {!daily && <p className="text-sm text-gray-500">Loading…</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "artist" && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">The Artist</CardTitle>
            <CardDescription>Back which artist has the biggest week. Spins in, Spins out. No money fund on this one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-400">
              The Artist round runs on the existing Backing engine, which now settles on counted plays like the rest.
              Its controls, open a round, set the pool, settle, live on the Backing Desk.
            </p>
            <a href="/dashboard/cosign">
              <Button variant="outline">Open the Backing Desk</Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
