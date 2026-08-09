"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Activity, Users, Plus, Trash2, Lock, Unlock, Star } from "lucide-react"

/**
 * /dashboard/ward, THE WARD desk.
 *
 * The staff, their prescriptions and dose targets, the Spin packs, the
 * buy link, and today's clip. Nothing here is written into the app: changing
 * any of it changes the app on the next page load, with no deploy.
 *
 * The instant switches (featured, on staff / off staff, unlock) save the
 * moment they are pressed. Text fields save behind their own button.
 */

interface Pack {
  key: string
  name: string
  cents: number
  spins: number
  bonus: number
  line: string
  best: boolean
}

interface SpinSettings {
  spins_per_play: number
  starter_spins: number
  dose_pct: number
  refill_every: number
  refill_spins: number
  /** Free treatments a patient gets each clinic day. */
  courtesy_per_day: number
  /** The shared target a newly published prescription starts with. */
  dose_target: number
}

interface Rx {
  id: number
  status: string
  dose_total: number
  dose_target: number
  qualified_pct: number | null
  track_id: number
  seq: number
  target: number | null
  line: string
  unlocked: boolean
  doses: number
}

interface Therapist {
  id: number
  name: string
  bio: string
  image: string
  sort: number
  featured: boolean
  active: boolean
  doses: number
  prescriptions: Rx[]
}

interface TrackRow {
  id: number
  title: string
  artist: string
  cover?: string
  /** Already a prescription somewhere, so it cannot be used twice. */
  taken?: boolean
}

interface RosterArtist {
  id: string
  name: string
  image: string
}

interface Clip {
  url: string
  caption: string
  /** What the round is called. The archive drawer lists it. */
  title: string
  /** How long it runs, in seconds. Printed beside the title. */
  seconds: string
}

interface LiveRx {
  id: number
  seq: number
  status: string
  therapist: string
  title: string
  track_id: number
  line: string
  dose_total: number
  dose_target: number
  counted: number
  qualified_pct: number | null
  breached_at: string | null
}

interface WardRow {
  id: number
  seq: number
  status: string
  featured: boolean
  sort: number
  therapist: string
  title: string
  track_id: number
  dose_total: number
  dose_target: number
  counted: number
}

interface QueueRx {
  id: number
  seq: number
  therapist: string
  title: string
  dose_target: number
}

interface RetiredRx {
  id: number
  seq: number
  therapist: string
  title: string
  dose_total: number
  archived_at: string | null
}

interface NewRx {
  track_id: string
  seq: string
  target: string
  line: string
}

const EMPTY_RX: NewRx = { track_id: "", seq: "", target: "", line: "" }

export default function WardPage() {
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [spinCfg, setSpinCfg] = useState<SpinSettings>({
    spins_per_play: 1,
    starter_spins: 2,
    dose_pct: 80,
    refill_every: 25,
    refill_spins: 5,
    courtesy_per_day: 1,
    dose_target: 10000,
  })
  const [live, setLive] = useState<LiveRx | null>(null)
  const [onWard, setOnWard] = useState<WardRow[]>([])
  const [queue, setQueue] = useState<QueueRx[]>([])
  const [retired, setRetired] = useState<RetiredRx[]>([])
  const [tune, setTune] = useState({ target: "", pct: "" })
  const [grant, setGrant] = useState({ email: "", spins: "", reason: "" })
  const [buyUrl, setBuyUrl] = useState("")
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [census, setCensus] = useState(0)
  const [holders, setHolders] = useState(0)
  const [mint, setMint] = useState<string | null>(null)
  const [clip, setClip] = useState<Clip>({ url: "", caption: "", title: "", seconds: "" })
  const [day, setDay] = useState("")

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const [hire, setHire] = useState({ artist_id: "", bio: "" })
  const [songTarget, setSongTarget] = useState<Record<number, string>>({})
  const [artists, setArtists] = useState<RosterArtist[]>([])
  const [unmatched, setUnmatched] = useState<TrackRow[]>([])
  const [newRx, setNewRx] = useState<Record<number, NewRx>>({})

  const load = useCallback(() => {
    fetch("/api/admin/ward", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the ward"))))
      .then((d) => {
        setTherapists(Array.isArray(d.therapists) ? d.therapists : [])
        setPacks(Array.isArray(d.config?.packs) ? d.config.packs : [])
        setSpinCfg({
          spins_per_play: Number(d.config?.spins_per_play ?? 1),
          starter_spins: Number(d.config?.starter_spins ?? 2),
          dose_pct: Number(d.config?.dose_pct ?? 80),
          refill_every: Number(d.config?.refill_every ?? 25),
          refill_spins: Number(d.config?.refill_spins ?? 5),
          courtesy_per_day: Number(d.config?.courtesy_per_day ?? 1),
          dose_target: Number(d.config?.dose_target ?? 10000),
        })
        setLive(d.live ?? null)
        setOnWard(Array.isArray(d.onWard) ? d.onWard : [])
        setQueue(Array.isArray(d.queue) ? d.queue : [])
        setRetired(Array.isArray(d.retired) ? d.retired : [])
        setTune({
          target: d.live?.dose_target ? String(d.live.dose_target) : "",
          pct: d.live?.qualified_pct ? String(d.live.qualified_pct) : "",
        })
        setBuyUrl(String(d.config?.buy_url ?? ""))
        setTracks(Array.isArray(d.tracks) ? d.tracks : [])
        setArtists(Array.isArray(d.artists) ? d.artists : [])
        setUnmatched(Array.isArray(d.unmatched) ? d.unmatched : [])
        setCensus(Number(d.census ?? 0))
        setHolders(Number(d.holders ?? 0))
        setMint(d.mint ?? null)
        setDay(String(d.day ?? ""))
        setClip(
          d.morningDose
            ? {
                url: d.morningDose.url,
                caption: d.morningDose.caption ?? "",
                title: d.morningDose.title ?? "",
                seconds: d.morningDose.seconds ? String(d.morningDose.seconds) : "",
              }
            : { url: "", caption: "", title: "", seconds: "" },
        )
        setError("")
      })
      .catch((e) => setError(e instanceof Error ? e.message : "something went wrong"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const flash = (tag: string) => {
    setSaved(tag)
    setTimeout(() => setSaved(""), 2200)
  }

  const post = async (tag: string, payload: Record<string, unknown>) => {
    if (busy) return false
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      flash(tag)
      load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
      return false
    } finally {
      setBusy("")
    }
  }

  const patch = async (tag: string, payload: Record<string, unknown>) => {
    if (busy) return
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      flash(tag)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
    } finally {
      setBusy("")
    }
  }

  const setT = (id: number, part: Partial<Therapist>) =>
    setTherapists((list) => list.map((t) => (t.id === id ? { ...t, ...part } : t)))

  const setRx = (tid: number, rid: number, part: Partial<Rx>) =>
    setTherapists((list) =>
      list.map((t) =>
        t.id === tid
          ? { ...t, prescriptions: t.prescriptions.map((r) => (r.id === rid ? { ...r, ...part } : r)) }
          : t,
      ),
    )

  const setPack = (key: string, part: Partial<Pack>) =>
    setPacks((list) => list.map((p) => (p.key === key ? { ...p, ...part } : p)))

  const trackName = (id: number) => {
    const t = tracks.find((x) => x.id === id)
    return t ? `${t.title} · ${t.artist}` : `#${id}`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the ward
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">The Ward</h1>
        <p className="text-sm text-gray-500">
          The staff, their prescriptions, the packs, the door. Nothing here is written into the app.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : null}

      {/* ── WHAT IS ON THE WARD RIGHT NOW ──
          One prescription at a time. Nothing swaps itself at the target: the
          record holds at DOSAGE LIMIT BREACHED and waits for the button here,
          so a release happens when the post and the artwork are ready and not
          at three in the morning to nobody. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Activity className="w-4 h-4" /> On the ward right now
          </CardTitle>
          <CardDescription>
            Every prescription patients can see, grouped by therapist in the app. One of them is Dr. Onus&rsquo;s
            pick and sits at the top. A song that reaches its target holds there until you retire it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!live ? (
            <p className="text-sm text-gray-500">
              Nothing is on the ward. Add a prescription below, then put it on the ward.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    live.status === "breached"
                      ? "bg-yellow-950/50 text-yellow-400"
                      : "bg-green-950/50 text-green-400"
                  }`}
                >
                  {live.status === "breached" ? "DOSAGE LIMIT BREACHED" : "ACTIVE"}
                </span>
                <span className="text-lg font-bold text-white">{live.title || `Track ${live.track_id}`}</span>
                <span className="text-sm text-gray-500">{live.therapist}</span>
                <span className="text-xs text-gray-600">PRESCRIPTION {String(live.seq).padStart(3, "0")}</span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-mono text-white">
                    {live.dose_total.toLocaleString("en-US")} / {live.dose_target.toLocaleString("en-US")} doses
                  </span>
                  <span className="text-xs text-gray-500">
                    {Math.max(0, live.dose_target - live.dose_total).toLocaleString("en-US")} to go
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${Math.min(100, live.dose_target > 0 ? (live.dose_total / live.dose_target) * 100 : 0)}%`,
                    }}
                  />
                </div>
                {live.counted !== live.dose_total ? (
                  <p className="mt-2 text-xs text-yellow-500">
                    The counter says {live.dose_total.toLocaleString("en-US")} but {live.counted.toLocaleString("en-US")}{" "}
                    doses are on the ledger for this track. They should match.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Shared dose target</label>
                  <Input
                    value={tune.target}
                    inputMode="numeric"
                    onChange={(e) => setTune({ ...tune, target: e.target.value.replace(/[^0-9]/g, "") })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Qualifying percent, this one only</label>
                  <Input
                    value={tune.pct}
                    inputMode="numeric"
                    placeholder={String(spinCfg.dose_pct)}
                    onChange={(e) => setTune({ ...tune, pct: e.target.value.replace(/[^0-9]/g, "") })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      post("tune", {
                        what: "rx_tune",
                        id: live.id,
                        dose_target: Number(tune.target || live.dose_target),
                        qualified_pct: tune.pct,
                      })
                    }
                    disabled={busy === "tune"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy === "tune" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "tune" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            {onWard.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nothing is on the ward. Add a prescription below, then put it on the ward.
              </p>
            ) : (
              onWard.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg border p-3 ${
                    r.featured ? "border-green-800 bg-green-950/20" : "border-gray-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {r.featured ? (
                      <span className="rounded bg-green-500 px-2 py-0.5 text-[10px] font-bold text-black">PICK</span>
                    ) : null}
                    {r.status === "breached" ? (
                      <span className="rounded bg-yellow-950/50 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                        LIMIT REACHED
                      </span>
                    ) : null}
                    <span className="font-semibold text-white">{r.title || `Track ${r.track_id}`}</span>
                    <span className="text-sm text-gray-500">{r.therapist}</span>
                    <span className="ml-auto font-mono text-xs text-gray-400">
                      {r.dose_total.toLocaleString("en-US")} / {r.dose_target.toLocaleString("en-US")}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-gray-800">
                    <div
                      className={r.status === "breached" ? "h-full bg-yellow-500" : "h-full bg-green-500"}
                      style={{
                        width: `${Math.min(100, r.dose_target > 0 ? (r.dose_total / r.dose_target) * 100 : 0)}%`,
                      }}
                    />
                  </div>

                  {r.counted !== r.dose_total ? (
                    <p className="mt-2 text-[11px] text-yellow-500">
                      Counter says {r.dose_total.toLocaleString("en-US")} but the ledger has{" "}
                      {r.counted.toLocaleString("en-US")} for this track. They should match.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={r.featured || busy === `feat-${r.id}`}
                      onClick={() => post(`feat-${r.id}`, { what: "rx_feature", id: r.id })}
                      className="rounded border border-gray-700 px-2 py-1 font-semibold text-gray-300 hover:border-green-800 hover:text-green-400 disabled:opacity-40"
                    >
                      {r.featured ? "IS THE PICK" : "MAKE IT THE PICK"}
                    </button>

                    <button
                      type="button"
                      disabled={busy === `ret-${r.id}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Retire this prescription? It leaves the ward and moves to the archive, where patients can still play it.",
                          )
                        ) {
                          post(`ret-${r.id}`, { what: "rx_retire", id: r.id })
                        }
                      }}
                      className="rounded border border-gray-700 px-2 py-1 font-semibold text-gray-300 hover:border-red-900 hover:text-red-400 disabled:opacity-40"
                    >
                      RETIRE
                    </button>

                    <label className="ml-auto flex items-center gap-2 text-gray-500">
                      Order
                      <input
                        type="number"
                        defaultValue={r.sort}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== r.sort) post(`sort-${r.id}`, { what: "rx_sort", id: r.id, sort: v })
                        }}
                        className="w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                      />
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border border-gray-800 p-3">
            <div className="text-xs font-semibold tracking-wider text-gray-400">NEXT UP</div>
            {queue.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">
                Nothing is prepared. Add a prescription below and leave it classified, then publish it here.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-gray-300">
                {queue.map((q) => (
                  <li key={q.id} className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-gray-600" />
                    <span className="font-semibold">{q.title || `Track ${q.id}`}</span>
                    <span className="text-gray-500">{q.therapist}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                if (queue.length === 0) return
                if (
                  window.confirm(
                    "Publish this prescription? It joins the ward and its title becomes public immediately. Nothing is retired by publishing; retire a song separately when you want it off the ward.",
                  )
                ) {
                  post("publish", { what: "rx_publish", id: queue[0]?.id })
                }
              }}
              disabled={busy === "publish" || queue.length === 0}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "publish" ? <Check className="w-4 h-4" /> : <Star className="w-4 h-4" />}
              Publish the next prescription
            </button>
          </div>

          {retired.length > 0 ? (
            <div className="rounded-lg border border-gray-800 p-3">
              <div className="text-xs font-semibold tracking-wider text-gray-400">PREVIOUS PRESCRIPTIONS</div>
              <ul className="mt-2 space-y-1 text-sm text-gray-400">
                {retired.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="font-semibold text-gray-300">{r.title || `Track ${r.id}`}</span>
                    <span className="text-gray-500">{r.therapist}</span>
                    <span className="ml-auto font-mono text-xs">{r.dose_total.toLocaleString("en-US")} doses</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Users className="w-4 h-4" /> Ward census
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{census.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">accounts the clinic has seen. The app shows this number.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Holding Spins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{holders.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">accounts with at least one Spin left</p>
          </CardContent>
        </Card>
      </div>

      {/* ── THE STAFF ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>The therapists</CardTitle>
          <CardDescription>
            The starred one leads the ward. FEATURE and ON STAFF save the instant they are pressed;
            names, bios, images and prescriptions save with their own button. Locked prescriptions
            never reach the app, so the next title stays a secret until its target is hit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {therapists.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-800 p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title={t.featured ? "Leading the ward" : "Put this therapist on the ward"}
                  onClick={() => !t.featured && post(`feat-${t.id}`, { what: "therapist_feature", id: t.id })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    t.featured
                      ? "border-yellow-600 bg-yellow-950/40 text-yellow-400"
                      : "border-gray-700 text-gray-400 hover:border-yellow-700 hover:text-yellow-500"
                  }`}
                >
                  <Star className="w-3.5 h-3.5" /> {t.featured ? "FEATURED" : "FEATURE"}
                </button>
                <button
                  type="button"
                  onClick={() => post(`act-${t.id}`, { what: "therapist_active", id: t.id, active: !t.active })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    t.active ? "border-green-800 bg-green-950/40 text-green-400" : "border-gray-700 text-gray-500"
                  }`}
                >
                  {t.active ? "ON STAFF" : "OFF STAFF"}
                </button>
                <span className="ml-auto text-xs text-gray-500">
                  {t.doses.toLocaleString("en-US")} doses lifetime
                </span>
                <button
                  type="button"
                  title="Remove this therapist and their prescriptions"
                  onClick={() => {
                    if (window.confirm(`Remove ${t.name} and every prescription attached? Doses already counted stay in the ledger.`)) {
                      post(`del-${t.id}`, { what: "therapist_delete", id: t.id })
                    }
                  }}
                  className="rounded-lg border border-gray-800 p-1.5 text-gray-500 hover:border-red-900 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                  <Input value={t.name} onChange={(e) => setT(t.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Sort (low sits first)</label>
                  <Input
                    type="number"
                    value={t.sort}
                    onChange={(e) => setT(t.id, { sort: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Bio, one or two lines</label>
                <textarea
                  value={t.bio}
                  onChange={(e) => setT(t.id, { bio: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                <div className="text-[11px] text-gray-500">
                  Picture, taken from this artist&rsquo;s record. Change it on the Artists page and the ward
                  follows. There is no link to paste here, which is how a wrong or unsigned image used to
                  get in.
                </div>
                <div className="mt-1 break-all font-mono text-[10px] text-gray-400">
                  {t.image || "using the cover art"}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  post(`tsave-${t.id}`, {
                    what: "therapist_save",
                    id: t.id,
                    name: t.name,
                    bio: t.bio,
                    sort: t.sort,
                  })
                }
                disabled={busy === `tsave-${t.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {busy === `tsave-${t.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === `tsave-${t.id}` ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                Save the therapist
              </button>

              {/* ── PRESCRIPTIONS ── */}
              <div className="space-y-3 border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold tracking-wider text-gray-400">PRESCRIPTIONS</div>
                {t.prescriptions.map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-800 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
                          r.status === "current"
                            ? "bg-green-950/50 text-green-400"
                            : r.status === "breached"
                              ? "bg-yellow-950/50 text-yellow-400"
                              : r.status === "archived"
                                ? "bg-gray-900 text-gray-500"
                                : "bg-gray-900 text-gray-400"
                        }`}
                      >
                        {r.status === "classified" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {r.status === "current"
                          ? "ON THE WARD"
                          : r.status === "breached"
                            ? "LIMIT REACHED"
                            : r.status === "archived"
                              ? "RETIRED"
                              : "CLASSIFIED"}
                      </span>
                      <span className="text-gray-500">{r.doses.toLocaleString("en-US")} doses</span>
                      {r.status === "classified" ? (
                        <button
                          type="button"
                          onClick={() => post(`cur-${r.id}`, { what: "rx_set_current", id: r.id })}
                          className="rounded border border-gray-700 px-2 py-1 font-semibold text-gray-300 hover:border-green-800 hover:text-green-400"
                          title="Put this on the ward now. Use PUBLISH for a real release."
                        >
                          PUT ON THE WARD
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove this prescription? Its doses stay in the ledger.")) {
                            post(`rxdel-${r.id}`, { what: "rx_delete", id: r.id })
                          }
                        }}
                        className="ml-auto rounded border border-gray-800 p-1 text-gray-500 hover:border-red-900 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <label className="block text-[11px] text-gray-500 mb-1">Track</label>
                        <select
                          value={r.track_id}
                          onChange={(e) => setRx(t.id, r.id, { track_id: Number(e.target.value) })}
                          className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-2 text-sm text-white"
                        >
                          <option value={r.track_id}>{trackName(r.track_id)}</option>
                          {tracks
                            .filter((x) => x.id !== r.track_id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title} · {x.artist}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Prescription #</label>
                        <Input type="number" value={r.seq} onChange={(e) => setRx(t.id, r.id, { seq: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Dose target to unlock</label>
                        <Input
                          type="number"
                          value={r.target ?? ""}
                          placeholder="none"
                          onChange={(e) => setRx(t.id, r.id, { target: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">One line of character copy under the title, optional</label>
                      <Input value={r.line} onChange={(e) => setRx(t.id, r.id, { line: e.target.value })} />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        post(`rxsave-${r.id}`, {
                          what: "rx_save",
                          id: r.id,
                          therapist_id: t.id,
                          track_id: r.track_id,
                          seq: r.seq,
                          target: r.target,
                          line: r.line,
                        })
                      }
                      disabled={busy === `rxsave-${r.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-200 disabled:opacity-60"
                    >
                      {busy === `rxsave-${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved === `rxsave-${r.id}` ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      Save the prescription
                    </button>
                  </div>
                ))}

                {/* add a prescription */}
                <div className="rounded-lg border border-dashed border-gray-800 p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Track</label>
                      <select
                        value={(newRx[t.id] ?? EMPTY_RX).track_id}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), track_id: e.target.value } }))}
                        className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-2 text-sm text-white"
                      >
                        <option value="">Pick a track</option>
                        {tracks.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.title} · {x.artist}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Prescription #</label>
                      <Input
                        type="number"
                        placeholder={String(t.prescriptions.length + 1)}
                        value={(newRx[t.id] ?? EMPTY_RX).seq}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), seq: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Dose target to unlock</label>
                      <Input
                        type="number"
                        placeholder="10000"
                        value={(newRx[t.id] ?? EMPTY_RX).target}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), target: e.target.value } }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">One line of character copy, optional</label>
                    <Input
                      value={(newRx[t.id] ?? EMPTY_RX).line}
                      onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), line: e.target.value } }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const v = newRx[t.id] ?? EMPTY_RX
                      const ok = await post(`rxadd-${t.id}`, {
                        what: "rx_save",
                        therapist_id: t.id,
                        track_id: v.track_id === "" ? null : Number(v.track_id),
                        seq: v.seq === "" ? t.prescriptions.length + 1 : Number(v.seq),
                        target: v.target === "" ? null : Number(v.target),
                        line: v.line,
                      })
                      if (ok) setNewRx((m) => ({ ...m, [t.id]: EMPTY_RX }))
                    }}
                    disabled={busy === `rxadd-${t.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-200 disabled:opacity-60"
                  >
                    {busy === `rxadd-${t.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add the prescription
                  </button>
                  <p className="text-[11px] text-gray-600">
                    Prescription 1 goes on the ward the moment it is added. Every later one needs a dose
                    target and unlocks itself when the therapist reaches it.
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* HIRE STRAIGHT OFF THE ROSTER */}
          <div className="rounded-xl border border-dashed border-gray-800 p-4 space-y-3">
            <div className="text-xs font-semibold tracking-wider text-gray-400">PUT AN ARTIST ON STAFF</div>
            <p className="text-[11px] text-gray-600">
              Pick from the artists you already have. The name and the picture come from their artist
              record, so there is nothing to type and no link to paste.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Artist</label>
                <select
                  value={hire.artist_id}
                  onChange={(e) => setHire({ ...hire, artist_id: e.target.value })}
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Pick an artist</option>
                  {artists
                    .filter((a) => !therapists.some((t) => t.name.trim().toLowerCase() === a.name.trim().toLowerCase()))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Bio, optional</label>
                <Input value={hire.bio} onChange={(e) => setHire({ ...hire, bio: e.target.value })} />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await post("hire", { what: "hire_artist", artist_id: hire.artist_id, bio: hire.bio })
                if (ok) setHire({ artist_id: "", bio: "" })
              }}
              disabled={busy === "hire" || !hire.artist_id}
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy === "hire" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Put on staff
            </button>
          </div>

          {/* THEIR CATALOGUE, AS TICK BOXES */}
          {therapists.length > 0 ? (
            <div className="rounded-xl border border-gray-800 p-4 space-y-3">
              <div className="text-xs font-semibold tracking-wider text-gray-400">SONGS ON THE WARD</div>
              <p className="text-[11px] text-gray-600">
                Every song each therapist has in the catalogue. Tick one to put it up, untick to take
                it off. The first song a therapist gets is live immediately; give a later one a dose
                target to keep it locked until the ward earns it.
              </p>
              {therapists.map((t) => {
                const mine = tracks.filter(
                  (x) => x.artist.trim().toLowerCase() === t.name.trim().toLowerCase(),
                )
                return (
                  <div key={t.id} className="rounded-lg border border-gray-800 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                      {t.name}
                      {t.featured ? <span className="text-yellow-400">FEATURED</span> : null}
                      <span className="ml-auto text-gray-600">{mine.length} in catalogue</span>
                    </div>
                    {mine.length === 0 ? (
                      <p className="mt-2 text-[11px] text-gray-600">
                        No song in Tracks carries this artist name. Fix the artist field on the track
                        and it appears here.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {mine.map((x) => {
                          const on = t.prescriptions.some((r) => r.track_id === x.id)
                          const rx = t.prescriptions.find((r) => r.track_id === x.id)
                          const elsewhere = x.taken && !on
                          return (
                            <div key={x.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <button
                                type="button"
                                disabled={elsewhere || busy === `song-${x.id}`}
                                onClick={() =>
                                  post(`song-${x.id}`, {
                                    what: "song_toggle",
                                    therapist_id: t.id,
                                    track_id: x.id,
                                    on: !on,
                                    target: songTarget[x.id] ?? "",
                                  })
                                }
                                className={`rounded border px-2 py-1 font-semibold ${
                                  on
                                    ? "border-green-800 bg-green-950/40 text-green-400"
                                    : elsewhere
                                      ? "border-gray-800 text-gray-700"
                                      : "border-gray-700 text-gray-400"
                                }`}
                              >
                                {on ? "ON THE WARD" : elsewhere ? "ON SOMEONE ELSE" : "PUT IT UP"}
                              </button>
                              <span className="text-gray-300">{x.title}</span>
                              {rx ? (
                                <span className="text-gray-600">
                                  RX {String(rx.seq).padStart(3, "0")} &middot; {rx.doses.toLocaleString("en-US")} doses
                                  {rx.unlocked ? "" : ` · locked at ${rx.target ?? 0}`}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  placeholder="lock target"
                                  value={songTarget[x.id] ?? ""}
                                  onChange={(e) => setSongTarget({ ...songTarget, [x.id]: e.target.value })}
                                  className="w-28 rounded bg-gray-900 border border-gray-800 px-2 py-1 text-xs text-white"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* SONGS THAT MATCH NOBODY */}
          {unmatched.length > 0 ? (
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
              <div className="text-xs font-semibold tracking-wider text-amber-400">
                {unmatched.length} SONGS MATCH NO ARTIST
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                A track&rsquo;s artist is plain text, so a different spelling or a stray space hides it
                from the list above. Fix the artist field in Tracks and it comes back.
              </p>
              <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                {unmatched.slice(0, 20).map((x) => (
                  <div key={x.id}>
                    {x.title} <span className="text-gray-600">by &ldquo;{x.artist || "nobody"}&rdquo;</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

        </CardContent>
      </Card>

      {/* ── SPIN PACKS ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Spin packs</CardTitle>
          <CardDescription>
            The three refills. Prices are in cents, Spins are what actually gets credited when the
            payment lands, so a pack always pays exactly the number typed here. The bonus percent is
            only the badge on the card. MOST PRESCRIBED marks one pack in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {packs.map((p) => (
            <div key={p.key} className="rounded-lg border border-gray-800 p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-5">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Name</label>
                  <Input value={p.name} onChange={(e) => setPack(p.key, { name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Price, cents</label>
                  <Input type="number" value={p.cents} onChange={(e) => setPack(p.key, { cents: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Spins credited</label>
                  <Input type="number" value={p.spins} onChange={(e) => setPack(p.key, { spins: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Bonus badge, %</label>
                  <Input type="number" value={p.bonus} onChange={(e) => setPack(p.key, { bonus: Number(e.target.value) })} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setPacks((list) => list.map((x) => ({ ...x, best: x.key === p.key ? !p.best : false })))}
                    className={`w-full rounded-lg border px-2 py-2 text-xs font-semibold ${
                      p.best ? "border-yellow-600 bg-yellow-950/40 text-yellow-400" : "border-gray-700 text-gray-400"
                    }`}
                  >
                    {p.best ? "MOST PRESCRIBED" : "Mark most prescribed"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">One line under the price</label>
                <Input value={p.line} onChange={(e) => setPack(p.key, { line: e.target.value })} />
              </div>
              <p className="text-[11px] text-gray-600">
                {p.cents > 0 ? `${(p.spins / (p.cents / 100)).toFixed(0)} Spins per dollar` : "Set a price"}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch("packs", { packs })}
            disabled={busy === "packs"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "packs" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "packs" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the packs
          </button>
        </CardContent>
      </Card>

      {/* ── THE SPIN RULES ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Spins, doses and the refill</CardTitle>
          <CardDescription>
            Every number the economy runs on. Changing the dose threshold or the refill interval
            takes effect on the next treatment, and the refill can never pay a patient twice for a
            threshold they already passed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Spins per treatment</label>
              <Input
                type="number"
                value={spinCfg.spins_per_play}
                onChange={(e) => setSpinCfg({ ...spinCfg, spins_per_play: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">What one play costs.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Starter Spins</label>
              <Input
                type="number"
                value={spinCfg.starter_spins}
                onChange={(e) => setSpinCfg({ ...spinCfg, starter_spins: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Handed to an account once, the first time it opens the ward.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Dose threshold, %</label>
              <Input
                type="number"
                value={spinCfg.dose_pct}
                onChange={(e) => setSpinCfg({ ...spinCfg, dose_pct: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                How much of a track has to play before it counts.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Refill every N doses</label>
              <Input
                type="number"
                value={spinCfg.refill_every}
                onChange={(e) => setSpinCfg({ ...spinCfg, refill_every: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Refill pays, Spins</label>
              <Input
                type="number"
                value={spinCfg.refill_spins}
                onChange={(e) => setSpinCfg({ ...spinCfg, refill_spins: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Courtesy treatments a day</label>
              <Input
                type="number"
                value={spinCfg.courtesy_per_day}
                onChange={(e) => setSpinCfg({ ...spinCfg, courtesy_per_day: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Free treatments every patient gets. Zero turns the courtesy off entirely.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Default shared target</label>
              <Input
                type="number"
                value={spinCfg.dose_target}
                onChange={(e) => setSpinCfg({ ...spinCfg, dose_target: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                What a newly published prescription starts with. The one on the ward is set above.
              </p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600">
            At these numbers a patient gets back{" "}
            {spinCfg.refill_every > 0
              ? `${((spinCfg.refill_spins / (spinCfg.refill_every * Math.max(1, spinCfg.spins_per_play))) * 100).toFixed(0)}%`
              : "0%"}{" "}
            of what they spend on treatments.
          </p>
          <button
            type="button"
            onClick={() => patch("spins", { ...spinCfg })}
            disabled={busy === "spins"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "spins" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "spins" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the numbers
          </button>
        </CardContent>
      </Card>

      {/* ── HAND SPINS TO SOMEBODY ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Give an account Spins</CardTitle>
          <CardDescription>
            For when a payment lands and something breaks. A negative number takes Spins away. The
            reason is written into the admin log beside your name, so this is never a quiet change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Account email</label>
              <Input value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Spins</label>
              <Input
                type="number"
                value={grant.spins}
                placeholder="100"
                onChange={(e) => setGrant({ ...grant, spins: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Reason</label>
            <Input
              value={grant.reason}
              placeholder="paid, webhook missed it, reference abc123"
              onChange={(e) => setGrant({ ...grant, reason: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              const ok = await post("grant", {
                what: "grant_spins",
                email: grant.email,
                spins: Number(grant.spins),
                reason: grant.reason,
              })
              if (ok) setGrant({ email: "", spins: "", reason: "" })
            }}
            disabled={busy === "grant"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "grant" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "grant" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Apply
          </button>
        </CardContent>
      </Card>

      {/* ── MORNING DOSE ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s Morning Dose</CardTitle>
          <CardDescription>
            The clip for {day}. Upload the file to Bunny like a cover, then paste the link here.
            Clearing the link takes the card off the ward. Tomorrow starts empty. Every round you save
            stays in the Morning Dose Archive, which is why the title and the length matter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Clip link</label>
            <Input value={clip.url} placeholder="https://..." onChange={(e) => setClip({ ...clip, url: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
              <Input
                value={clip.title}
                placeholder="Before You Open the Chart"
                onChange={(e) => setClip({ ...clip, title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Length in seconds</label>
              <Input
                value={clip.seconds}
                inputMode="numeric"
                placeholder="30"
                onChange={(e) => setClip({ ...clip, seconds: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              What Dr. Onus says, shown beside the clip
            </label>
            <Input value={clip.caption} onChange={(e) => setClip({ ...clip, caption: e.target.value })} />
          </div>
          <button
            type="button"
            onClick={() => post("clip", { what: "clip", ...clip, seconds: Number(clip.seconds || 0) })}
            disabled={busy === "clip"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "clip" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "clip" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the clip
          </button>
        </CardContent>
      </Card>

      {/* ── THE DOOR ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>The door</CardTitle>
          <CardDescription>
            The CA the app shows inside the admission step is the payment mint from Settings, so a
            wrong address and a broken checkout are the same fault. It no longer sits in the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">BUY $PUMP link, optional override</label>
            <Input value={buyUrl} placeholder="https://pump.fun/coin/..." onChange={(e) => setBuyUrl(e.target.value)} />
            <p className="text-[11px] text-gray-600 mt-1">Empty = the app links straight to the mint on pump.fun.</p>
          </div>
          <button
            type="button"
            onClick={() => patch("buy", { buy_url: buyUrl })}
            disabled={busy === "buy"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "buy" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "buy" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the link
          </button>
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <div className="text-[11px] text-gray-500">The mint the app publishes (changed on the payments card in Settings)</div>
            <div className="mt-1 break-all font-mono text-xs text-gray-300">{mint ?? "not set"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
