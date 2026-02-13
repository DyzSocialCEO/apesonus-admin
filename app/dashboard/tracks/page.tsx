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
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

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
        <Button onClick={openAdd} className="bg-primary text-black hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> Add Track
        </Button>
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
                        {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-400 text-sm">{track.play_count}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {track.is_featured && (
                            <button onClick={() => handleQuickToggle(track, "is_featured", false)} title="Featured (click to remove)">
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
                            <span className="text-gray-600 text-xs">—</span>
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
                  <Input value={editTrack.artist || ""} onChange={(e) => setEditTrack({ ...editTrack, artist: e.target.value })} placeholder="Artist name" />
                </div>
              </div>

              {/* Mood + Duration */}
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Duration (seconds)
                    {detectingDuration && <span className="ml-2 text-xs text-primary animate-pulse">⏳ Detecting...</span>}
                    {!detectingDuration && editTrack.duration ? <span className="ml-2 text-xs text-green-400">✓ Auto-detected</span> : null}
                  </label>
                  <Input type="number" value={editTrack.duration || 0} onChange={(e) => setEditTrack({ ...editTrack, duration: parseInt(e.target.value) || 0 })} placeholder="Auto-detected from audio" />
                </div>
              </div>

              {/* Audio + Cover URLs */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Audio URL (BunnyCDN) *</label>
                <Input value={editTrack.audio || ""} onChange={(e) => {
                  const url = e.target.value
                  setEditTrack({ ...editTrack, audio: url })
                  detectDuration(url)
                }} placeholder="https://stokmoji-audio.b-cdn.net/music/..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Cover Image URL (BunnyCDN)</label>
                <Input value={editTrack.cover || ""} onChange={(e) => setEditTrack({ ...editTrack, cover: e.target.value })} placeholder="https://stokmoji-images.b-cdn.net/images-rekterapy/..." />
                {editTrack.cover && (
                  <img src={editTrack.cover} alt="Preview" className="w-16 h-16 rounded-lg object-cover mt-2 bg-gray-800" />
                )}
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
                      <p className="text-sm text-white font-medium">⭐ Featured</p>
                      <p className="text-xs text-gray-500">Hero card on Discover</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editTrack.is_editors_choice || false} onChange={(e) => setEditTrack({ ...editTrack, is_editors_choice: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <div>
                      <p className="text-sm text-white font-medium">👑 Editor&apos;s Choice</p>
                      <p className="text-xs text-gray-500">Featured section</p>
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
