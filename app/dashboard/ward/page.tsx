"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Activity, Users, Plus, Trash2, Lock, Unlock, Star, Music2, ChevronRight } from "lucide-react"

/**
 * /dashboard/ward, THE WARD desk.
 *
 * The staff, their prescriptions and dose targets, the buy link, and today's
 * Listening is free, so nothing on this desk prices it. Nothing here is
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
  const [retired, setRetired] = useState<RetiredRx[]>([])
  const [tune, setTune] = useState({ target: "", pct: "" })
  const [buyUrl, setBuyUrl] = useState("")
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [census, setCensus] = useState(0)
  const [holders, setHolders] = useState(0)
  const [mint, setMint] = useState<string | null>(null)
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
          THE WARD, IN THREE CARDS.

          What is up, the whole catalogue with a tick beside each song, and
          the one number a Dose depends on. Targets, breaches, the queue and
          the automatic archive are gone with the model that needed them: a
          song is on the ward because somebody put it there and comes down
          because somebody took it down.
          ══════════════════════════════════════════════════════════════ */}

      {/* 1. ON THE WARD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Music2 className="w-4 h-4" /> 1. On the ward
            <span className="ml-auto text-xs font-normal text-gray-500">
              {desk.live.length} {desk.live.length === 1 ? "song" : "songs"}
            </span>
          </CardTitle>
          <CardDescription>
            Everything patients can play right now. Tap the star to choose the one in focus at the top of
            the app, and Take it off to bring one down. Doses keep counting either way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {desk.live.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on the ward. Flip a song on below.</p>
          ) : (
            desk.live.map((s) => {
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
                  </div>

                  <span className="shrink-0 font-mono text-xs text-gray-400">
                    {s.doses.toLocaleString("en-US")} doses
                  </span>

                  <button
                    type="button"
                    disabled={busy === `park-${s.trackId}`}
                    onClick={() => post(`park-${s.trackId}`, { what: "song_park", track_id: s.trackId })}
                    className="shrink-0 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:border-yellow-800 hover:text-yellow-400 disabled:opacity-40"
                  >
                    Take it off
                  </button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* 2. THE CATALOGUE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> 2. The catalogue
            <span className="ml-auto text-xs font-normal text-gray-500">
              {desk.artists.length} artists &middot; {desk.artists.reduce((n, a) => n + a.songs.length, 0)} songs
            </span>
          </CardTitle>
          <CardDescription>
            Your artists and their songs, straight from Tracks. Flip one on and it is on the ward, flip it
            off and it comes down. As many as you like, from as many therapists as you like. The line saves
            when you click away. Nothing retires on its own and a song that comes off keeps its dose count.
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
                      // NOTHING BLOCKS A SECOND SONG ANY MORE. A therapist used
                      // to have one slot, so every other song of theirs was
                      // greyed out until it was freed. They build a shelf now.
                      return (
                        <div key={s.trackId} className="flex flex-wrap items-center gap-3 border-b border-gray-900 py-3 last:border-b-0">
                          <button
                            type="button"
                            disabled={busy === `sw-${s.trackId}`}
                            title={
                              up
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
                              up ? "bg-green-800" : "bg-gray-700"
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
                          ) : (
                            <span className="w-[86px] shrink-0 text-right text-[11px] text-gray-600">OFF</span>
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

      {/* ── DOSES ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Doses</CardTitle>
          <CardDescription>
            Listening is free, and nothing is aimed at a number any more. This is the one setting
            left: how much of a track has to play before it counts. It takes effect on the next
            treatment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* THE TARGET FIELD IS GONE, not hidden. It set a number that
              nothing reads: no counter is capped by it and no song retires
              when it is reached. A dial that does nothing is worse than no
              dial, because it looks like a decision. */}
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
          </div>
          <button
            type="button"
            onClick={() => patch("doses", { dose_pct: doseCfg.dose_pct })}
            disabled={busy === "doses"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "doses" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "doses" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the numbers
          </button>
        </CardContent>
      </Card>

    </div>
  )
}
