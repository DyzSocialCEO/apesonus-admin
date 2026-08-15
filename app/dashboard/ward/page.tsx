"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Activity, Users, Plus, Trash2, Lock, Unlock, Star, Music2, ChevronRight } from "lucide-react"

/**
 * /dashboard/ward, THE WARD desk.
 *
 * The staff, their prescriptions and dose targets, the buy link, and today's
 * clip. Listening is free, so nothing on this desk prices it. Nothing here is
 * written into the app: changing any of it changes the app on the next page
 * load, with no deploy.
 *
 * The instant switches (featured, on staff / off staff, unlock) save the
 * moment they are pressed. Text fields save behind their own button.
 */

/** What a Dose is worth and what a new prescription is aimed at. */
interface DoseSettings {
  dose_pct: number
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

/** What ward_desk() hands back. One read, the whole page. */
interface DeskSong {
  trackId: number
  title: string
  duration: number
  cover: string
  state: string
  line: string
  doses: number
}
interface DeskArtist {
  name: string
  image: string
  songs: DeskSong[]
}
interface DeskLive {
  id: number
  trackId: number
  title: string
  artist: string
  cover: string
  line: string
  featured: boolean
  status: string
  doses: number
  target: number
}
interface DeskQueued {
  id: number
  trackId: number
  title: string
  artist: string
  cover: string
  pos: number | null
}
interface DeskArchived {
  id: number
  trackId: number
  title: string
  artist: string
  cover: string
  doses: number
  archivedAt: string | null
}
interface Desk {
  target: number
  pct: number
  live: DeskLive[]
  queue: DeskQueued[]
  archive: DeskArchived[]
  artists: DeskArtist[]
}
/**
 * Images are stored as short paths, the way the Tracks and Artists pages
 * expect them. Anything that is not already a full URL gets the CDN in front
 * of it, or the browser looks for the file on the admin domain and finds
 * nothing.
 */
const IMAGE_CDN = "https://apesonus-images.b-cdn.net"
function img(src: string): string {
  if (!src) return ""
  if (src.startsWith("http")) return src
  return `${IMAGE_CDN}${src.startsWith("/") ? "" : "/"}${src}`
}

const EMPTY_DESK: Desk = { target: 10000, pct: 80, live: [], queue: [], archive: [], artists: [] }

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
  const [doseCfg, setDoseCfg] = useState<DoseSettings>({
    dose_pct: 80,
    dose_target: 10000,
  })
  const [live, setLive] = useState<LiveRx | null>(null)
  const [onWard, setOnWard] = useState<WardRow[]>([])
  const [desk, setDesk] = useState<Desk>(EMPTY_DESK)
  const [deskTarget, setDeskTarget] = useState("10000")
  const [deskPct, setDeskPct] = useState("80")
  const [openArtist, setOpenArtist] = useState<string | null>(null)
  // What he has typed but not yet committed, per track. A line for a song that
  // is still off has nowhere on the server to live, so it waits here and goes
  // up WITH the song. Typing a caption used to do nothing at all unless the
  // song was already published, which meant publishing first and captioning
  // second. Backwards.
  const [lineDraft, setLineDraft] = useState<Record<number, string>>({})
  const [queue, setQueue] = useState<QueueRx[]>([])
  const [founding, setFounding] = useState<{ issued: number; admitted: number } | null>(null)
  const [fClose, setFClose] = useState("")
  const [fDaily, setFDaily] = useState("")
  const [fNeeded, setFNeeded] = useState("")
  const [fWindow, setFWindow] = useState("")
  const [retired, setRetired] = useState<RetiredRx[]>([])
  const [tune, setTune] = useState({ target: "", pct: "" })
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
        setDoseCfg({
          dose_pct: Number(d.config?.dose_pct ?? 80),
          dose_target: Number(d.config?.dose_target ?? 10000),
        })
        setLive(d.live ?? null)
        setOnWard(Array.isArray(d.onWard) ? d.onWard : [])
        if (d.desk) {
          const k = d.desk as Desk
          setDesk({
            target: Number(k.target ?? 10000),
            pct: Number(k.pct ?? 80),
            live: Array.isArray(k.live) ? k.live : [],
            queue: Array.isArray(k.queue) ? k.queue : [],
            archive: Array.isArray(k.archive) ? k.archive : [],
            artists: Array.isArray(k.artists) ? k.artists : [],
          })
          setDeskTarget(String(k.target ?? 10000))
          setDeskPct(String(k.pct ?? 80))
        }
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
        if (d.founding) {
          setFounding({ issued: Number(d.founding.issued ?? 0), admitted: Number(d.founding.admitted ?? 0) })
          setFClose(String(d.founding.close ?? ""))
          setFDaily(String(d.founding.daily ?? "10"))
          setFNeeded(String(d.founding.needed ?? "7"))
          setFWindow(String(d.founding.windowDays ?? "10"))
        }
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

  // Days left on the founding series, read off the SAVED close date. Null when
  // the field is empty or malformed, negative once the date has passed. There
  // is deliberately no separate on/off switch: two controls for one state is
  // how a series ends up open in the app and closed on the desk.
  const seriesDays = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fClose)) return null
    const end = Date.parse(`${fClose}T23:59:59Z`)
    if (!Number.isFinite(end)) return null
    return Math.floor((end - Date.now()) / 86400000)
  })()

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
      // The typed line has landed on the server now, so the draft stops
      // overriding what comes back on the next read.
      const t = Number((payload as { track_id?: unknown }).track_id)
      if (Number.isFinite(t)) {
        setLineDraft((m) => {
          const next = { ...m }
          delete next[t]
          return next
        })
      }
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
          The staff, their prescriptions, the door. Nothing here is written into the app.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════
          THE WARD, IN FOUR CARDS.

          One target. Tick the songs. Order what comes next. That is the whole
          page. The staff list, prescription numbers, per song targets, the
          hire form and the songs-match-nobody warning are all gone: they were
          four ways of describing the same thing, and the warning only ever
          existed because two tables held the same names.
          ══════════════════════════════════════════════════════════════ */}

      {/* 1. THE TARGET */}
      {founding ? (
        <Card className="border-amber-700/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">THE FOUNDING SERIES</CardTitle>
            <CardDescription>
              The Original Prescription. Issued automatically when a patient admitted before the close date
              completes the daily treatments on enough days inside their window. Saving here changes the live
              rules immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-8 font-mono text-sm">
              <div><span className="text-gray-500">Issued</span> <strong className="text-amber-300">{founding.issued}</strong></div>
              <div><span className="text-gray-500">Admitted in window</span> <strong>{founding.admitted}</strong></div>
              {/* Whether the door is still open, worked out from the saved close
                  date rather than a second switch. One date, one truth. */}
              <div>
                <span className="text-gray-500">Series</span>{" "}
                {seriesDays === null ? (
                  <strong className="text-gray-500">NO CLOSE DATE</strong>
                ) : seriesDays >= 0 ? (
                  <strong className="text-emerald-400">
                    OPEN · {seriesDays} day{seriesDays === 1 ? "" : "s"} left
                  </strong>
                ) : (
                  <strong className="text-red-400">CLOSED</strong>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block text-[11px] text-gray-500">Series closes (UTC)
                <input value={fClose} onChange={(e) => setFClose(e.target.value)} placeholder="2026-08-27"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-sm" />
              </label>
              <label className="block text-[11px] text-gray-500">Treatments per day
                <input value={fDaily} onChange={(e) => setFDaily(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-sm" />
              </label>
              <label className="block text-[11px] text-gray-500">Days needed
                <input value={fNeeded} onChange={(e) => setFNeeded(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-sm" />
              </label>
              <label className="block text-[11px] text-gray-500">Personal window (days)
                <input value={fWindow} onChange={(e) => setFWindow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-sm" />
              </label>
            </div>
            <button type="button" disabled={busy === "founding"}
              onClick={() => post("founding", { what: "founding_config", close: fClose, daily: fDaily, needed: fNeeded, window_days: fWindow })}
              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40">
              Save series rules
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Activity className="w-4 h-4" /> 1. The dose target
          </CardTitle>
          <CardDescription>
            One number for every song on the ward. Reach it and the song moves to the archive on its own,
            and the next one in the queue comes up. Changing it changes every song at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[11px] text-gray-500 mb-1">Doses before a song retires</label>
              <Input
                value={deskTarget}
                inputMode="numeric"
                onChange={(e) => setDeskTarget(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[11px] text-gray-500 mb-1">A dose counts at</label>
              <Input
                value={deskPct}
                inputMode="numeric"
                onChange={(e) => setDeskPct(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <button
              type="button"
              onClick={() => post("target", { what: "desk_target", target: Number(deskTarget), pct: Number(deskPct) })}
              disabled={busy === "target"}
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy === "target" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "target" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            <p className="basis-full text-xs text-gray-600">
              {desk.live.length} on the ward, each retiring at {Number(deskTarget || 0).toLocaleString("en-US")} doses,
              counted at {deskPct || 80}% of the track.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. ON THE WARD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Music2 className="w-4 h-4" /> 2. On the ward
            <span className="ml-auto text-xs font-normal text-gray-500">
              {desk.live.length} {desk.live.length === 1 ? "song" : "songs"}
            </span>
          </CardTitle>
          <CardDescription>Tap the star to choose the one in focus at the top of the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {desk.live.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on the ward. Flip a song on below.</p>
          ) : (
            desk.live.map((s) => {
              const pct = s.target > 0 ? Math.min(100, (s.doses / s.target) * 100) : 0
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    s.featured ? "border-green-800 bg-green-950/20" : "border-gray-800 bg-gray-950/40"
                  }`}
                >
                  <button
                    type="button"
                    disabled={s.featured || desk.live.length < 2}
                    title={
                      desk.live.length < 2
                        ? "Only one song is up, so it is already the one in focus"
                        : s.featured
                          ? "In focus"
                          : "Put this one in focus"
                    }
                    onClick={() => !s.featured && post(`feat-${s.id}`, { what: "rx_feature", id: s.id })}
                    className={
                      s.featured
                        ? "text-yellow-400"
                        : desk.live.length < 2
                          ? "cursor-not-allowed text-gray-700"
                          : "text-gray-600 hover:text-yellow-500"
                    }
                  >
                    <Star className="w-4 h-4" fill={s.featured ? "currentColor" : "none"} />
                  </button>

                  {img(s.cover) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(s.cover)} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-gray-800" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-gray-800 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                    <p className="truncate text-xs text-gray-500">{s.artist}</p>
                    <div className="mt-2 h-1 max-w-[320px] overflow-hidden rounded bg-gray-800">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <span className="shrink-0 font-mono text-xs text-gray-400">
                    {s.doses.toLocaleString("en-US")} / {s.target.toLocaleString("en-US")}
                  </span>

                  <button
                    type="button"
                    disabled={busy === `off-${s.trackId}`}
                    onClick={() => {
                      if (window.confirm(`Move ${s.title} to the archive? It comes off the ward and patients can still play it there.`)) {
                        post(`off-${s.trackId}`, { what: "song_off", track_id: s.trackId })
                      }
                    }}
                    className="shrink-0 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:border-red-900 hover:text-red-400 disabled:opacity-40"
                  >
                    Move to archive
                  </button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* 3. THE CATALOGUE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> 3. The catalogue
            <span className="ml-auto text-xs font-normal text-gray-500">
              {desk.artists.length} artists &middot; {desk.artists.reduce((n, a) => n + a.songs.length, 0)} songs
            </span>
          </CardTitle>
          <CardDescription>
            Your artists and their songs, straight from Tracks. Flip one on and it is on the ward. The line
            saves when you click away. <strong className="text-gray-300">One song per therapist:</strong> to
            put a different one up, switch the current one off first. Off keeps its dose count and stays out of the
            archive; only Move to archive and a finished 10,000 put a song in the archive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {desk.artists.map((a) => {
            const onCount = a.songs.filter((s) => s.state === "current" || s.state === "breached").length
            const isOpen = openArtist === a.name
            return (
              <div key={a.name} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950/40">
                <button
                  type="button"
                  onClick={() => setOpenArtist(isOpen ? null : a.name)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-900/50"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-800 text-sm font-bold text-gray-400">
                    {a.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{a.name}</p>
                    <p className="text-xs text-gray-500">{a.songs.length} songs</p>
                  </div>
                  {onCount > 0 ? (
                    <span className="rounded-full border border-green-800 bg-green-950/40 px-2.5 py-1 text-[11px] text-green-400">
                      {onCount} on the ward
                    </span>
                  ) : null}
                  <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>

                {isOpen ? (
                  <div className="border-t border-gray-800 px-3 pb-3">
                    {a.songs.map((s) => {
                      const up = s.state === "current" || s.state === "breached"
                      // Their slot is taken by a different song of theirs.
                      const blocked =
                        !up &&
                        s.state !== "classified" &&
                        a.songs.some((o) => o.state === "current" || o.state === "breached")
                      return (
                        <div key={s.trackId} className="flex flex-wrap items-center gap-3 border-b border-gray-900 py-3 last:border-b-0">
                          <button
                            type="button"
                            disabled={busy === `sw-${s.trackId}` || blocked}
                            title={
                              blocked
                                ? "This therapist already has a song on the ward. Switch it off or archive it first."
                                : up
                                  ? "Take it off the ward. It keeps its dose count and does not go to the archive."
                                  : "Put it on the ward"
                            }
                            onClick={() =>
                              post(`sw-${s.trackId}`, {
                                what: up ? "song_park" : "song_on",
                                track_id: s.trackId,
                                line: lineDraft[s.trackId] ?? s.line,
                              })
                            }
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                              up ? "bg-green-800" : blocked ? "cursor-not-allowed bg-gray-800 opacity-40" : "bg-gray-700"
                            }`}
                          >
                            <span
                              className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${
                                up ? "left-[26px] bg-green-400" : "left-[3px] bg-gray-400"
                              }`}
                            />
                          </button>

                          <div className="w-[180px] min-w-0">
                            <p className="truncate text-sm text-white">{s.title}</p>
                            <p className="text-[11px] text-gray-600">
                              {Math.floor(s.duration / 60)}:{String(s.duration % 60).padStart(2, "0")}
                              {s.doses > 0 ? ` · ${s.doses.toLocaleString("en-US")} doses` : ""}
                            </p>
                          </div>

                          <div className="min-w-[160px] flex-1">
                            <Input
                              value={lineDraft[s.trackId] ?? s.line}
                              placeholder="One line under the title, optional"
                              onChange={(e) =>
                                setLineDraft((m) => ({ ...m, [s.trackId]: e.target.value }))
                              }
                              onBlur={(e) => {
                                // Already up, so the line can be saved on its own.
                                if (e.target.value !== s.line && (up || s.state === "classified")) {
                                  post(`line-${s.trackId}`, {
                                    what: "song_line",
                                    track_id: s.trackId,
                                    line: e.target.value,
                                  })
                                }
                              }}
                            />
                            {!up && s.state !== "classified" && (lineDraft[s.trackId] ?? "").trim() !== "" ? (
                              <p className="mt-1 text-[11px] text-yellow-600">
                                Goes up with the song when you flip it on.
                              </p>
                            ) : null}
                          </div>

                          {up ? (
                            <span className="w-[86px] shrink-0 text-right text-[11px] text-green-500">ON THE WARD</span>
                          ) : s.state === "classified" ? (
                            <span className="w-[86px] shrink-0 text-right text-[11px] text-yellow-600">QUEUED</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                post(`q-${s.trackId}`, {
                                  what: "song_queue",
                                  track_id: s.trackId,
                                  line: lineDraft[s.trackId] ?? s.line,
                                })
                              }
                              className="w-[86px] shrink-0 rounded border border-gray-800 py-1 text-[11px] text-gray-500 hover:border-yellow-800 hover:text-yellow-500"
                            >
                              Queue it
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* 4. NEXT UP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Lock className="w-4 h-4" /> 4. Next up
            <span className="ml-auto text-xs font-normal text-gray-500">the order they join</span>
          </CardTitle>
          <CardDescription>
            When a song reaches the target and retires, the top of this queue takes its place. Patients never
            see these titles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {desk.queue.length === 0 ? (
            <p className="text-sm text-gray-500">
              Queue empty. Nothing will replace a song when it retires, the ward just gets smaller.
            </p>
          ) : (
            desk.queue.map((q, i) => (
              <div key={q.id} className="flex items-center gap-3 rounded-lg border border-dashed border-gray-800 p-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-900 text-[11px] font-semibold text-gray-400">
                  {i + 1}
                </span>
                {img(q.cover) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(q.cover)} alt="" className="w-9 h-9 rounded object-cover shrink-0 bg-gray-800" />
                ) : (
                  <div className="w-9 h-9 rounded bg-gray-800 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{q.title}</p>
                  <p className="truncate text-xs text-gray-500">{q.artist}</p>
                </div>
                {i > 0 ? (
                  <button type="button" onClick={() => post(`mu-${q.id}`, { what: "queue_move", id: q.id, up: true })}
                    className="rounded border border-gray-800 px-2 py-1 text-xs text-gray-500 hover:text-white">&uarr;</button>
                ) : null}
                {i < desk.queue.length - 1 ? (
                  <button type="button" onClick={() => post(`md-${q.id}`, { what: "queue_move", id: q.id, up: false })}
                    className="rounded border border-gray-800 px-2 py-1 text-xs text-gray-500 hover:text-white">&darr;</button>
                ) : null}
                <button type="button"
                  onClick={() => post(`qon-${q.trackId}`, { what: "song_on", track_id: q.trackId })}
                  className="rounded border border-gray-800 px-2 py-1 text-[11px] text-gray-400 hover:border-green-800 hover:text-green-400">
                  Put it up now
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* THE ARCHIVE */}
      {desk.archive.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">The archive</CardTitle>
            <CardDescription>Retired, off the ward, and still playable for patients who go looking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {desk.archive.map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="truncate font-medium text-gray-300">{s.title}</span>
                <span className="truncate text-gray-600">{s.artist}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-gray-600">
                  {s.doses.toLocaleString("en-US")} doses
                </span>
                <button
                  type="button"
                  onClick={() => post(`back-${s.trackId}`, { what: "song_on", track_id: s.trackId })}
                  className="shrink-0 rounded border border-gray-800 px-2 py-1 text-[11px] text-gray-500 hover:border-green-800 hover:text-green-400"
                >
                  Put it back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Scrap "${s.title}" from the archive? It disappears from the app's archive for everyone. The song itself stays in Tracks and can be prescribed again fresh.`,
                      )
                    ) {
                      post(`scrap-${s.id}`, { what: "rx_scrap", id: s.id })
                    }
                  }}
                  className="shrink-0 rounded border border-gray-800 px-2 py-1 text-[11px] text-gray-600 hover:border-red-900 hover:text-red-400"
                >
                  Scrap
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* ── DOSES ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Doses</CardTitle>
          <CardDescription>
            Listening is free. These two numbers are what a Dose means and what a new prescription is
            aimed at. Changing the threshold takes effect on the next treatment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Dose threshold, %</label>
              <Input
                type="number"
                value={doseCfg.dose_pct}
                onChange={(e) => setDoseCfg({ ...doseCfg, dose_pct: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                How much of a track has to play before it counts.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Default shared target</label>
              <Input
                type="number"
                value={doseCfg.dose_target}
                onChange={(e) => setDoseCfg({ ...doseCfg, dose_target: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                What a newly published prescription starts with. The one on the ward is set above.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => patch("doses", { ...doseCfg })}
            disabled={busy === "doses"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "doses" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "doses" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the numbers
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
