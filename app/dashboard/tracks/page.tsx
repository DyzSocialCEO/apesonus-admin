"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Music, Plus, Pencil, Trash2, Loader2, Star, Headphones, Eye, EyeOff, X, Save, Crown,
} from "lucide-react"

interface Track {
  id: number
  title: string
  artist: string
  mood: string
  cover: string
  audio: string
  duration: number
  is_instrumental: boolean
  soundbath_category: string | null
  is_active: boolean
  is_featured: boolean
  is_editors_choice: boolean
  play_count: number
  sort_order: number
}

const MOODS = ["moon", "rekt", "cope", "degen", "zen"]
const SOUNDBATH_CATS = ["lofi", "piano", "jazz", "ambient", "meditation"]

const AUDIO_CDN = "https://apesonus-audio.b-cdn.net"
const IMAGE_CDN = "https://apesonus-images.b-cdn.net"

const ARTISTS = [
  { id: "chartnobyl-bro",    name: "Chartnobyl Bro"    },
  { id: "coinalisa",         name: "Coinalisa"          },
  { id: "dj-dustwallet",     name: "DJ Dustwallet"      },
  { id: "lola-likwidity",    name: "Lola Likwidity"     },
  { id: "mcbagholder",       name: "McBagholder"        },
  { id: "shilliam-dafoe",    name: "Shilliam Dafoe"     },
  { id: "satosheek",         name: "Satosheek"          },
  { id: "shim-liquidation",  name: "Shim Liquidation"   },
  { id: "rektina-loprez",    name: "Rektina Loprez"     },
]

function expandAudioUrl(input: string): string {
  if (!input) return ""
  if (input.startsWith("http")) return input
  return `${AUDIO_CDN}${input.startsWith("/") ? "" : "/"}${input}`
}

function expandImageUrl(input: string): string {
  if (!input) return ""
  if (input.startsWith("http")) return input
  return `${IMAGE_CDN}${input.startsWith("/") ? "" : "/"}${input}`
}

function shortenUrl(url: string, base: string): string {
  if (!url) return ""
  return url.replace(base, "")
}

// Returns the primary artist name from "Shill Shady ft. Miss Candlesticker"
function getPrimaryArtist(artistStr: string): string {
  return artistStr.split(/\s+ft\.?\s+/i)[0].trim()
}

const emptyTrack: Partial<Track> = {
  title: "", artist: "", mood: "moon", cover: "", audio: "", duration: 0,
  is_instrumental: false, soundbath_category: null, is_active: true,
  is_featured: false, is_editors_choice: false, sort_order: 0,
}

export default function TracksPage() {
  const [tracks, setTracks]               = useState<Track[]>([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [showModal, setShowModal]         = useState(false)
  const [editTrack, setEditTrack]         = useState<Partial<Track> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [msg, setMsg]                     = useState("")
  const [detectingDuration, setDetectingDuration] = useState(false)
  const [batchFixing, setBatchFixing]     = useState(false)
  const [batchProgress, setBatchProgress] = useState("")

  // ─── Artist filter ─────────────────────────────────────────────────────────
  const [filterArtist, setFilterArtist] = useState<string>("all")

  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Duration detection now happens SERVER-SIDE via
  // /api/admin/fix-duration (reliable for every upload; the old
  // browser <audio> method failed with SRC_NOT_SUPPORTED on signed
  // CDN URLs). batchFixDurations / fixSingleTrackDuration call it.


  const batchFixDurations = async () => {
    const broken = tracks.filter(t => (!t.duration || t.duration === 0) && t.audio)
    if (broken.length === 0) { setMsg("All tracks already have durations!"); return }
    setBatchFixing(true); setBatchProgress(`Detecting durations server-side...`)
    try {
      // Server-side detection: reliable for every upload (no browser
      // <audio> element, which kept failing with SRC_NOT_SUPPORTED).
      const res = await fetch("/api/admin/fix-duration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      setBatchFixing(false); setBatchProgress("")
      await fetchTracks()
      if (!res.ok) {
        setMsg(`Duration fix failed: ${data.error || res.status}`)
        return
      }
      const fails = (data.results || []).filter((r: { ok: boolean }) => !r.ok)
      if (data.failed > 0) {
        const reasons = fails
          .map((r: { title: string; reason: string }) => `"${r.title}": ${r.reason}`)
          .join("  ||  ")
        setMsg(`Duration fix: ${data.fixed} fixed, ${data.failed} failed of ${data.total}. REASONS — ${reasons}`)
      } else {
        setMsg(`Duration fix complete: ${data.fixed} fixed, 0 failed out of ${data.total}`)
      }
    } catch (e) {
      setBatchFixing(false); setBatchProgress("")
      setMsg(`Duration fix error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const fixSingleTrackDuration = async (track: Track) => {
    try {
      const res = await fetch("/api/admin/fix-duration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(`Failed for "${track.title}": ${data.error || res.status}`); return }
      const r = (data.results || [])[0]
      if (r && r.ok) {
        await fetchTracks()
        setMsg(`Fixed "${track.title}": ${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, "0")}`)
      } else {
        setMsg(`Could not detect duration for "${track.title}": ${r ? r.reason : "unknown"}`)
      }
    } catch (e) { setMsg(`Failed to fix "${track.title}": ${e instanceof Error ? e.message : String(e)}`) }
  }

  const detectDuration = (rawUrl: string) => {
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current)
    if (!rawUrl || !rawUrl.startsWith("http")) return
    durationTimerRef.current = setTimeout(async () => {
      setDetectingDuration(true)
      try {
        // Server-side detection (reliable for every upload). No
        // browser <audio> element, which failed with SRC_NOT_SUPPORTED.
        const res = await fetch("/api/admin/fix-duration", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: rawUrl }),
        })
        const data = await res.json()
        if (data.ok && data.duration > 0) {
          setEditTrack(prev => prev ? { ...prev, duration: Math.round(data.duration) } : prev)
        } else {
          console.warn("[Duration] Auto-detect failed:", data.reason)
        }
      } catch (err) {
        console.warn("[Duration] Auto-detect failed:", err)
      } finally {
        setDetectingDuration(false)
      }
    }, 800)
  }

  useEffect(() => { fetchTracks() }, [])

  const fetchTracks = async () => {
    try {
      const res = await fetch("/api/admin/tracks")
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch { } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!editTrack?.title || !editTrack?.artist || !editTrack?.audio) {
      setMsg("Title, artist, and audio URL are required"); return
    }
    setSaving(true); setMsg("")
    try {
      const isEdit = editTrack.id
      const res = await fetch("/api/admin/tracks", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTrack),
      })
      if (!res.ok) throw new Error("Failed")
      setShowModal(false); setEditTrack(null)
      await fetchTracks()
      setMsg(isEdit ? "Track updated!" : "Track created!")
    } catch { setMsg("Failed to save track") } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/admin/tracks?id=${id}`, { method: "DELETE" })
      setDeleteConfirm(null); await fetchTracks(); setMsg("Track deleted")
    } catch { setMsg("Failed to delete") }
  }

  const handleQuickToggle = async (track: Track, field: string, value: boolean) => {
    try {
      await fetch("/api/admin/tracks", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, [field]: value }),
      })
      await fetchTracks()
    } catch { }
  }

  const openAdd = () => {
    // Pre-fill artist if a filter is active
    const pre = { ...emptyTrack }
    if (filterArtist !== "all") {
      const a = ARTISTS.find(a => a.id === filterArtist)
      if (a) {
        pre.artist = a.name
        // Copy cover from existing track of this artist
        const existing = tracks.find(t => getPrimaryArtist(t.artist).toLowerCase() === a.name.toLowerCase())
        if (existing?.cover) pre.cover = existing.cover
      }
    }
    setEditTrack(pre); setShowModal(true); setMsg("")
  }

  const openEdit = (t: Track) => {
    setEditTrack({ ...t }); setShowModal(true); setMsg("")
    if ((!t.duration || t.duration === 0) && t.audio) detectDuration(t.audio)
  }

  // ─── Filtered track list ───────────────────────────────────────────────────
  const displayedTracks = filterArtist === "all"
    ? tracks
    : tracks.filter(t => {
        const primary = getPrimaryArtist(t.artist)
        const artistName = ARTISTS.find(a => a.id === filterArtist)?.name || ""
        return primary.toLowerCase() === artistName.toLowerCase()
      })

  const brokenCount = tracks.filter(t => !t.duration || t.duration === 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracks</h1>
          <p className="text-gray-400">
            {filterArtist === "all"
              ? `All artists · ${tracks.length} tracks`
              : `${ARTISTS.find(a => a.id === filterArtist)?.name} · ${displayedTracks.length} track${displayedTracks.length !== 1 ? "s" : ""}`
            }
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={openAdd} className="bg-primary text-black hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            {filterArtist !== "all" ? `Add for ${ARTISTS.find(a => a.id === filterArtist)?.name?.split(" ")[0]}` : "Add Track"}
          </Button>
          {brokenCount > 0 && (
            <Button onClick={batchFixDurations} disabled={batchFixing} variant="outline"
              className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
              {batchFixing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Music className="w-4 h-4 mr-2" />}
              {batchFixing ? batchProgress : `Fix Durations (${brokenCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* ── Artist filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterArtist("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filterArtist === "all"
              ? "bg-primary/15 text-primary border border-primary/30"
              : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:text-white"
          }`}
        >
          All Artists
        </button>
        {ARTISTS.map(a => {
          const count = tracks.filter(t => getPrimaryArtist(t.artist).toLowerCase() === a.name.toLowerCase()).length
          return (
            <button key={a.id}
              onClick={() => setFilterArtist(filterArtist === a.id ? "all" : a.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterArtist === a.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:text-white"
              }`}
            >
              {a.name.split(" ")[0]}
              <span className={`text-[10px] px-1 rounded ${filterArtist === a.id ? "bg-primary/20" : "bg-gray-700"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.includes("Failed") || msg.includes("required") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {msg}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : displayedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Music className="w-10 h-10 text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">
                {filterArtist !== "all"
                  ? `No tracks for ${ARTISTS.find(a => a.id === filterArtist)?.name} yet.`
                  : "No tracks yet."
                }
              </p>
              <button onClick={openAdd} className="mt-3 text-primary text-xs underline">Add one →</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">Track</th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">Artist</th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">Mood</th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-400">Duration</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Plays</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Flags</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-gray-400">Active</th>
                    <th className="text-right py-4 px-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTracks.map((track) => (
                    <tr key={track.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {track.cover ? (
                            <img src={track.cover} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-800" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                              <Music className="w-5 h-5 text-gray-600" />
                            </div>
                          )}
                          <span className="text-white font-medium text-sm">{track.title}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-300 text-sm">{track.artist}</td>
                      <td className="py-3 px-4">
                        <Badge variant={track.mood as any}>{track.mood.toUpperCase()}</Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {(!track.duration || track.duration === 0) ? (
                          <button onClick={() => fixSingleTrackDuration(track)}
                            className="text-red-400 hover:text-orange-400 underline decoration-dotted cursor-pointer" title="Click to detect duration">
                            0:00 ⚠️
                          </button>
                        ) : (
                          <>{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}</>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-400 text-sm">{track.play_count}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {track.is_featured && (
                            <button onClick={() => handleQuickToggle(track, "is_featured", false)} title="Fresh Drop · click to remove">
                              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            </button>
                          )}
                          {track.is_editors_choice && (
                            <button onClick={() => handleQuickToggle(track, "is_editors_choice", false)} title="Editor's Choice · click to remove">
                              <Crown className="w-4 h-4 text-primary" />
                            </button>
                          )}
                          {track.is_instrumental && (
                            <button onClick={() => handleQuickToggle(track, "is_instrumental", false)} title="SoundBath · click to remove">
                              <Headphones className="w-4 h-4 text-cyan-400" />
                            </button>
                          )}
                          {!track.is_featured && !track.is_editors_choice && !track.is_instrumental && (
                            <button onClick={() => handleQuickToggle(track, "is_featured", true)} title="Add to Fresh Drops"
                              className="text-gray-600 hover:text-[#ffc847] transition-colors text-xs">
                              +🔥
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => handleQuickToggle(track, "is_active", !track.is_active)}
                          title={track.is_active ? "Active · click to deactivate" : "Inactive · click to activate"}>
                          {track.is_active
                            ? <Eye className="w-4 h-4 text-green-400" />
                            : <EyeOff className="w-4 h-4 text-red-400" />}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(track)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {deleteConfirm === track.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(track.id)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">Yes</button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded bg-gray-700 text-white text-xs">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(track.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      {showModal && editTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">{editTrack.id ? "Edit Track" : "Add New Track"}</h2>
              <button onClick={() => { setShowModal(false); setEditTrack(null) }} className="p-1 rounded-lg hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Title *</label>
                <Input value={editTrack.title || ""} onChange={(e) => setEditTrack({ ...editTrack, title: e.target.value })} placeholder="Track title" />
              </div>

              {/* Primary Artist */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Primary Artist *</label>
                <select
                  value={getPrimaryArtist(editTrack.artist || "")}
                  onChange={(e) => {
                    const name = e.target.value
                    const featMatch = (editTrack.artist || "").match(/\s+ft\.?\s+(.*)/i)
                    const feat = featMatch ? featMatch[1] : ""
                    const fullArtist = feat ? `${name} ft. ${feat}` : name
                    const update: Partial<Track> = { ...editTrack, artist: fullArtist }
                    // Auto-fill cover from existing primary track of this artist
                    if (name) {
                      const existing = tracks.find(t => getPrimaryArtist(t.artist).toLowerCase() === name.toLowerCase() && t.cover)
                      if (existing?.cover) update.cover = existing.cover
                    }
                    setEditTrack(update)
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">Select artist...</option>
                  {ARTISTS.map(a => <option key={a.id} value={a.name} style={{ background: "#111827" }}>{a.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">This determines whose page the track lives on.</p>
              </div>

              {/* Featured credit */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Featured Credit <span className="text-gray-500">(optional)</span>
                </label>
                <Input
                  value={(() => { const m = (editTrack.artist || "").match(/\s+ft\.?\s+(.*)/i); return m ? m[1] : "" })()}
                  onChange={(e) => {
                    const primary = getPrimaryArtist(editTrack.artist || "")
                    const feat = e.target.value.trim()
                    setEditTrack({ ...editTrack, artist: feat ? `${primary} ft. ${feat}` : primary })
                  }}
                  placeholder="e.g. Satosheek"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Track will display as "{getPrimaryArtist(editTrack.artist || "") || "Artist"} ft. {(editTrack.artist || "").match(/\s+ft\.?\s+(.*)/i)?.[1] || "..."}". 
                  It only appears on the primary artist's page — add it separately if you want it on the featured artist's page too.
                </p>
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Mood</label>
                <select value={editTrack.mood || "moon"} onChange={(e) => setEditTrack({ ...editTrack, mood: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  {MOODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>

              {/* Audio URL */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Audio Path *</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">{AUDIO_CDN}</span>
                  <Input value={shortenUrl(editTrack.audio || "", AUDIO_CDN)} onChange={(e) => {
                    const fullUrl = expandAudioUrl(e.target.value)
                    setEditTrack({ ...editTrack, audio: fullUrl })
                    detectDuration(fullUrl)
                  }} placeholder="/music/artist-name/track.m4a" />
                </div>
              </div>

              {/* Duration — auto-detected */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Duration</label>
                <div className={`w-full px-3 py-2.5 rounded-lg border text-sm flex items-center gap-2 ${
                  detectingDuration
                    ? "bg-gray-800/50 border-primary/50 text-primary"
                    : editTrack.duration && editTrack.duration > 0
                      ? "bg-green-500/5 border-green-500/30 text-green-400"
                      : "bg-gray-800/50 border-gray-700 text-gray-500"
                }`}>
                  {detectingDuration ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Detecting...</span></>
                  ) : editTrack.duration && editTrack.duration > 0 ? (
                    <>
                      <span className="text-lg font-mono font-bold">
                        {Math.floor(editTrack.duration / 60)}:{(editTrack.duration % 60).toString().padStart(2, "0")}
                      </span>
                      <span className="text-xs text-gray-500">({editTrack.duration}s — auto-detected ✓)</span>
                    </>
                  ) : (
                    <span>{editTrack.audio ? "Paste a valid audio URL above ↑" : "Will auto-detect when you add audio URL"}</span>
                  )}
                </div>
              </div>

              {/* Cover Image */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Cover Image{" "}
                  {editTrack.cover
                    ? <span className="text-green-400 text-xs ml-1">✓ set</span>
                    : <span className="text-yellow-400 text-xs ml-1">Paste path</span>}
                </label>
                <div className="flex items-center gap-2">
                  <Input value={shortenUrl(editTrack.cover || "", IMAGE_CDN)}
                    onChange={(e) => setEditTrack({ ...editTrack, cover: expandImageUrl(e.target.value) })}
                    placeholder="/images-rekterapy/artist.png" />
                  {editTrack.cover && (
                    <img src={editTrack.cover} alt="Preview" className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0" />
                  )}
                </div>
              </div>

              {/* Sort order */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Sort Order</label>
                <Input type="number" value={editTrack.sort_order || 0}
                  onChange={(e) => setEditTrack({ ...editTrack, sort_order: parseInt(e.target.value) || 0 })} />
              </div>

              {/* Flags */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-300">Flags</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_active !== false}
                      onChange={(e) => setEditTrack({ ...editTrack, is_active: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <p className="text-sm text-white font-medium">Active</p>
                      <p className="text-xs text-gray-500">Visible in app</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_featured || false}
                      onChange={(e) => setEditTrack({ ...editTrack, is_featured: e.target.checked })}
                      className="w-4 h-4 rounded accent-yellow-500" />
                    <div>
                      <p className="text-sm text-white font-medium">🔥 Fresh Drop</p>
                      <p className="text-xs text-gray-500">Hero card on Discover + artist page</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_editors_choice || false}
                      onChange={(e) => setEditTrack({ ...editTrack, is_editors_choice: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <div>
                      <p className="text-sm text-white font-medium">👑 Editor's Choice</p>
                      <p className="text-xs text-gray-500">Fresh Drops on home page</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_instrumental || false}
                      onChange={(e) => setEditTrack({ ...editTrack, is_instrumental: e.target.checked, soundbath_category: e.target.checked ? (editTrack.soundbath_category || "lofi") : null })}
                      className="w-4 h-4 rounded accent-cyan-500" />
                    <div>
                      <p className="text-sm text-white font-medium">🎧 Instrumental</p>
                      <p className="text-xs text-gray-500">Shows in SoundBath</p>
                    </div>
                  </label>
                </div>
              </div>

              {editTrack.is_instrumental && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">SoundBath Category</label>
                  <select value={editTrack.soundbath_category || "lofi"}
                    onChange={(e) => setEditTrack({ ...editTrack, soundbath_category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {SOUNDBATH_CATS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditTrack(null) }} className="border-gray-700 text-gray-300">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary text-black hover:bg-primary/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {editTrack.id ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
