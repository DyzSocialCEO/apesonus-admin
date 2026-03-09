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
  { id: "aunty-rugsy", name: "Aunty Rugsy" },
  { id: "chartnobyl-bro", name: "Chartnobyl Bro" },
  { id: "coinalisa-murado", name: "Coinalisa Murado" },
  { id: "down-bad-dave", name: "Down Bad Dave" },
  { id: "lola-likwidity", name: "Lola Likwidity" },
  { id: "miss-candlesticker", name: "Miss Candlesticker" },
  { id: "satoshi-deluxe", name: "Satoshi Deluxe" },
  { id: "shill-shady", name: "Shill Shady" },
  { id: "shilliam-dafoe", name: "Shilliam Dafoe" },
  { id: "satosheek", name: "Satosheek" },
]

// Helper: expand short path to full CDN URL
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

// Helper: shorten full URL to path for display
function shortenUrl(url: string, base: string): string {
  if (!url) return ""
  return url.replace(base, "")
}

const emptyTrack: Partial<Track> = {
  title: "", artist: "", mood: "moon", cover: "", audio: "", duration: 0,
  is_instrumental: false, soundbath_category: null, is_active: true,
  is_featured: false, is_editors_choice: false, sort_order: 0,
}

export default function TracksPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editTrack, setEditTrack] = useState<Partial<Track> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [msg, setMsg] = useState("")
  const [detectingDuration, setDetectingDuration] = useState(false)
  const [batchFixing, setBatchFixing] = useState(false)
  const [batchProgress, setBatchProgress] = useState("")
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  // Detect duration for a single audio URL via signed URL + Audio element
  const detectSingleDuration = (signedUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = "metadata"
      const timeout = setTimeout(() => { audio.src = ""; resolve(0) }, 10000)
      audio.onloadedmetadata = () => {
        clearTimeout(timeout)
        const dur = audio.duration && isFinite(audio.duration) ? Math.round(audio.duration) : 0
        audio.src = ""
        resolve(dur)
      }
      audio.onerror = () => { clearTimeout(timeout); audio.src = ""; resolve(0) }
      audio.src = signedUrl
    })
  }

  // Batch fix ALL tracks with duration 0
  const batchFixDurations = async () => {
    const broken = tracks.filter(t => (!t.duration || t.duration === 0) && t.audio)
    if (broken.length === 0) {
      setMsg("All tracks already have durations!")
      return
    }
    setBatchFixing(true)
    setBatchProgress(`Fixing 0/${broken.length}...`)
    let fixed = 0
    let failed = 0

    for (let i = 0; i < broken.length; i++) {
      const track = broken[i]
      setBatchProgress(`Fixing ${i + 1}/${broken.length}: ${track.title}...`)
      try {
        // Sign the URL
        const signRes = await fetch("/api/admin/detect-duration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: track.audio }),
        })
        if (!signRes.ok) { failed++; continue }
        const { signedUrl } = await signRes.json()

        // Detect duration client-side
        const duration = await detectSingleDuration(signedUrl)
        if (duration <= 0) { failed++; continue }

        // Save to DB
        const saveRes = await fetch("/api/admin/tracks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: track.id, duration }),
        })
        if (saveRes.ok) fixed++
        else failed++
      } catch {
        failed++
      }
      // Small delay to avoid hammering
      await new Promise(r => setTimeout(r, 300))
    }

    setBatchFixing(false)
    setBatchProgress("")
    await fetchTracks()
    setMsg(`Duration fix complete: ${fixed} fixed, ${failed} failed out of ${broken.length}`)
  }

  // Fix duration for a single track (from table row button)
  const fixSingleTrackDuration = async (track: Track) => {
    try {
      const signRes = await fetch("/api/admin/detect-duration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: track.audio }),
      })
      if (!signRes.ok) { setMsg(`Failed to sign URL for "${track.title}"`); return }
      const { signedUrl } = await signRes.json()

      const duration = await detectSingleDuration(signedUrl)
      if (duration <= 0) { setMsg(`Could not detect duration for "${track.title}" — file may be corrupt`); return }

      await fetch("/api/admin/tracks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, duration }),
      })
      await fetchTracks()
      setMsg(`Fixed "${track.title}": ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`)
    } catch {
      setMsg(`Failed to fix "${track.title}"`)
    }
  }

  // Auto-detect duration: sign URL via API, then load metadata client-side
  const detectDuration = (rawUrl: string) => {
    // Clear any pending detection
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current)
    if (audioElRef.current) { audioElRef.current.src = ""; audioElRef.current = null }

    if (!rawUrl || !rawUrl.startsWith("http")) return

    // Debounce 800ms so it only fires after you finish pasting
    durationTimerRef.current = setTimeout(async () => {
      setDetectingDuration(true)
      try {
        // 1. Get signed URL from server (handles BunnyCDN token auth)
        const res = await fetch("/api/admin/detect-duration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: rawUrl }),
        })
        if (!res.ok) throw new Error("Sign failed")
        const { signedUrl } = await res.json()

        // 2. Load only metadata (not the full file) to read duration
        const audio = new Audio()
        audioElRef.current = audio
        audio.preload = "metadata"

        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => {
            if (audio.duration && isFinite(audio.duration)) {
              setEditTrack(prev => prev ? { ...prev, duration: Math.round(audio.duration) } : prev)
            }
            resolve()
          }
          audio.onerror = () => reject(new Error("Audio load failed"))
          // Timeout after 8s
          setTimeout(() => reject(new Error("Timeout")), 8000)
          audio.src = signedUrl
        })
      } catch (err) {
        // Silent fail — user can still enter duration manually
        console.warn("[Duration] Auto-detect failed:", err)
      } finally {
        setDetectingDuration(false)
        if (audioElRef.current) { audioElRef.current.src = ""; audioElRef.current = null }
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
      setMsg("Title, artist, and audio URL are required")
      return
    }
    setSaving(true)
    setMsg("")
    try {
      const isEdit = editTrack.id
      const res = await fetch("/api/admin/tracks", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTrack),
      })
      if (!res.ok) throw new Error("Failed")
      setShowModal(false)
      setEditTrack(null)
      await fetchTracks()
      setMsg(isEdit ? "Track updated!" : "Track created!")
    } catch {
      setMsg("Failed to save track")
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/admin/tracks?id=${id}`, { method: "DELETE" })
      setDeleteConfirm(null)
      await fetchTracks()
      setMsg("Track deleted")
    } catch { setMsg("Failed to delete") }
  }

  const handleQuickToggle = async (track: Track, field: string, value: boolean) => {
    try {
      await fetch("/api/admin/tracks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, [field]: value }),
      })
      await fetchTracks()
    } catch { }
  }

  const openAdd = () => { setEditTrack({ ...emptyTrack }); setShowModal(true); setMsg("") }
  const openEdit = (t: Track) => {
    setEditTrack({ ...t }); setShowModal(true); setMsg("")
    // Auto-detect duration if missing
    if ((!t.duration || t.duration === 0) && t.audio) detectDuration(t.audio)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracks</h1>
          <p className="text-gray-400">Manage your music catalog ({tracks.length} tracks)</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openAdd} className="bg-primary text-black hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> Add Track
        </Button>
        <Button
          onClick={batchFixDurations}
          disabled={batchFixing}
          variant="outline"
          className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
        >
          {batchFixing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Music className="w-4 h-4 mr-2" />}
          {batchFixing ? batchProgress : `Fix Durations (${tracks.filter(t => !t.duration || t.duration === 0).length})`}
        </Button>
        </div>
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
                  {tracks.map((track) => (
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
                          <button
                            onClick={() => fixSingleTrackDuration(track)}
                            className="text-red-400 hover:text-orange-400 underline decoration-dotted cursor-pointer"
                            title="Click to detect duration"
                          >
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
                            <button onClick={() => handleQuickToggle(track, "is_featured", false)} title="Fresh Drop (click to remove)">
                              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            </button>
                          )}
                          {track.is_editors_choice && (
                            <button onClick={() => handleQuickToggle(track, "is_editors_choice", false)} title="Editor's Choice (click to remove)">
                              <Crown className="w-4 h-4 text-primary" />
                            </button>
                          )}
                          {track.is_instrumental && (
                            <button onClick={() => handleQuickToggle(track, "is_instrumental", false)} title="SoundBath (click to remove)">
                              <Headphones className="w-4 h-4 text-cyan-400" />
                            </button>
                          )}
                          {!track.is_featured && !track.is_editors_choice && !track.is_instrumental && (
                            <button onClick={() => handleQuickToggle(track, "is_featured", true)} title="Add to Fresh Drops" className="text-gray-600 hover:text-[#ffc847] transition-colors">
                              <span className="text-xs">+🔥</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleQuickToggle(track, "is_active", !track.is_active)}
                          title={track.is_active ? "Active (click to deactivate)" : "Inactive (click to activate)"}
                        >
                          {track.is_active ? (
                            <Eye className="w-4 h-4 text-green-400" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-red-400" />
                          )}
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
              {/* Title + Artist */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Title *</label>
                  <Input value={editTrack.title || ""} onChange={(e) => setEditTrack({ ...editTrack, title: e.target.value })} placeholder="Track title" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Artist *</label>
                  <select
                    value={editTrack.artist || ""}
                    onChange={(e) => {
                      const name = e.target.value
                      const update: Partial<Track> = { ...editTrack, artist: name }
                      // Auto-fill cover from existing tracks for this artist
                      if (name) {
                        const existing = tracks.find(t => t.artist === name || t.artist.startsWith(name))
                        if (existing?.cover) update.cover = existing.cover
                      }
                      setEditTrack(update)
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Select artist...</option>
                    {ARTISTS.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Mood</label>
                <select
                  value={editTrack.mood || "moon"}
                  onChange={(e) => setEditTrack({ ...editTrack, mood: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {MOODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>

              {/* Audio URL — moved ABOVE duration so user pastes first, then duration auto-fills */}
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

              {/* Duration — auto-detected, shown as status display */}
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
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Detecting duration from audio...</span>
                    </>
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
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Cover Image {editTrack.cover ? <span className="text-green-400 text-xs ml-1">Auto-filled from artist</span> : <span className="text-yellow-400 text-xs ml-1">Paste path or full URL</span>}
                </label>
                <div className="flex items-center gap-2">
                  <Input value={shortenUrl(editTrack.cover || "", IMAGE_CDN)} onChange={(e) => setEditTrack({ ...editTrack, cover: expandImageUrl(e.target.value) })} placeholder="/images-rekterapy/artist.png" />
                  {editTrack.cover && (
                    <img src={editTrack.cover} alt="Preview" className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0" />
                  )}
                </div>
              </div>

              {/* Sort order */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Sort Order</label>
                <Input type="number" value={editTrack.sort_order || 0} onChange={(e) => setEditTrack({ ...editTrack, sort_order: parseInt(e.target.value) || 0 })} placeholder="0" />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-300">Flags</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_active !== false} onChange={(e) => setEditTrack({ ...editTrack, is_active: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <p className="text-sm text-white font-medium">Active</p>
                      <p className="text-xs text-gray-500">Visible in app</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_featured || false} onChange={(e) => setEditTrack({ ...editTrack, is_featured: e.target.checked })}
                      className="w-4 h-4 rounded accent-yellow-500" />
                    <div>
                      <p className="text-sm text-white font-medium">🔥 Fresh Drop</p>
                      <p className="text-xs text-gray-500">Hero card on Discover</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_editors_choice || false} onChange={(e) => setEditTrack({ ...editTrack, is_editors_choice: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <div>
                      <p className="text-sm text-white font-medium">👑 Editor&apos;s Choice</p>
                      <p className="text-xs text-gray-500">Shows in Fresh Drops on home page</p>
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

              {/* SoundBath category — only show if instrumental */}
              {editTrack.is_instrumental && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">SoundBath Category</label>
                  <select
                    value={editTrack.soundbath_category || "lofi"}
                    onChange={(e) => setEditTrack({ ...editTrack, soundbath_category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {SOUNDBATH_CATS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditTrack(null) }} className="border-gray-700 text-gray-300">
                Cancel
              </Button>
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
