"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Music, Plus, Pencil, Trash2, Loader2, Save, X, ArrowLeft,
  AlertTriangle, CheckCircle2, Headphones,
} from "lucide-react"

/**
 * /dashboard/record/tracks
 *
 * Upload tracks for Record entries. Unlike /dashboard/tracks which
 * locks the artist to the 7 permanent personas, this page has a
 * free-text artist field for one-off visiting artists.
 *
 * All tracks created here are automatically flagged is_record_only=true
 * so they never appear in the main catalog. Composition with a
 * visiting_artist + commemorative text happens on the entries page.
 */

const AUDIO_CDN = "https://apesonus-audio.b-cdn.net"
const IMAGE_CDN = "https://apesonus-images.b-cdn.net"

// Moods are metadata only — the Record doesn't surface mood, but the
// tracks table requires a non-null value. "moon" is the safest default.
const MOODS = ["moon", "rekt", "cope", "degen", "zen"] as const

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

function formatDuration(seconds: number): string {
  if (!seconds) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

interface Track {
  id: number
  title: string
  artist: string
  mood: string
  cover: string
  audio: string
  duration: number
  is_active: boolean
  is_record_only: boolean
}

interface Draft {
  title: string
  artist: string
  mood: string
  cover: string
  audio: string
  duration: number
  is_active: boolean
}

const EMPTY_DRAFT: Draft = {
  title: "", artist: "", mood: "moon", cover: "", audio: "",
  duration: 0, is_active: true,
}

export default function RecordTracksPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [detectingDuration, setDetectingDuration] = useState(false)

  // Confirm delete
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)

  // Used to debounce automatic duration detection on audio paste
  const durationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load() {
    setLoading(true)
    try {
      // Use the existing tracks endpoint and filter client-side to
      // record-only. Keeps one source of truth for track data.
      const res = await fetch("/api/admin/tracks", { cache: "no-store" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMsg({ kind: "error", text: err.error || `Load failed: ${res.status}` })
        return
      }
      const data = await res.json()
      const all: Track[] = data.tracks || []
      setTracks(all.filter(t => t.is_record_only === true))
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Load failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  function openNew() {
    resetForm()
    setFormOpen(true)
    setMsg(null)
  }

  function openEdit(t: Track) {
    setEditingId(t.id)
    setDraft({
      title: t.title,
      artist: t.artist,
      mood: t.mood || "moon",
      cover: shortenUrl(t.cover || "", IMAGE_CDN),
      audio: shortenUrl(t.audio || "", AUDIO_CDN),
      duration: t.duration || 0,
      is_active: t.is_active !== false,
    })
    setFormOpen(true)
    setMsg(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Client-side duration detect — mirrors the existing tracks page.
  // Uses an offscreen <audio> element.
  function triggerDurationDetect(audioPath: string) {
    if (durationDebounce.current) clearTimeout(durationDebounce.current)
    durationDebounce.current = setTimeout(async () => {
      const fullUrl = expandAudioUrl(audioPath)
      if (!fullUrl) return
      setDetectingDuration(true)
      try {
        // Ask server to sign the URL so we can fetch from BunnyCDN
        const signRes = await fetch("/api/admin/detect-duration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: fullUrl }),
        })
        if (!signRes.ok) { setDetectingDuration(false); return }
        const { signedUrl } = await signRes.json()

        // Offscreen audio element
        const audio = new Audio()
        audio.preload = "metadata"
        audio.src = signedUrl
        audio.addEventListener("loadedmetadata", () => {
          const d = Math.round(audio.duration)
          if (d > 0 && Number.isFinite(d)) {
            setDraft(prev => ({ ...prev, duration: d }))
          }
          setDetectingDuration(false)
        }, { once: true })
        audio.addEventListener("error", () => setDetectingDuration(false), { once: true })

        // Timeout safety
        setTimeout(() => setDetectingDuration(false), 12_000)
      } catch {
        setDetectingDuration(false)
      }
    }, 600)
  }

  async function handleSave() {
    if (saving) return
    if (!draft.title.trim() || !draft.artist.trim() || !draft.audio.trim()) {
      setMsg({ kind: "error", text: "Title, artist, and audio URL are all required" })
      return
    }
    setSaving(true); setMsg(null)

    const payload = {
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      mood: draft.mood,
      cover: expandImageUrl(draft.cover.trim()),
      audio: expandAudioUrl(draft.audio.trim()),
      duration: draft.duration || 0,
      is_active: draft.is_active,
      // Route through the existing tracks route. It already handles
      // duration auto-detect server-side if we send 0. We pass
      // is_record_only=true so this track stays out of the main catalog.
      is_record_only: true,
    }

    try {
      let res: Response
      if (editingId) {
        // Existing PUT handler on tracks route takes { id, ...fields }
        res = await fetch("/api/admin/tracks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      } else {
        res = await fetch("/api/admin/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Save failed" })
      } else {
        setMsg({
          kind: "success",
          text: editingId ? `Updated "${payload.title}"` : `Uploaded "${payload.title}"`,
        })
        setFormOpen(false)
        resetForm()
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Delete failed" })
      } else {
        setMsg({ kind: "success", text: "Track deleted" })
        setConfirmingDelete(null)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.artist.trim().length > 0 &&
    draft.audio.trim().length > 0

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard/record" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        The Record
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Record Tracks</h1>
          <p className="text-gray-400 mt-1 text-sm">
            One-off tracks for Record entries. Free-text artist field, auto-hidden from main catalog.
          </p>
        </div>
        {!formOpen && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Upload new
          </Button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 flex items-center gap-2 ${
          msg.kind === "error"
            ? "bg-red-500/10 border border-red-500/30 text-red-400"
            : "bg-green-500/10 border border-green-500/30 text-green-400"
        }`}>
          {msg.kind === "error" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="text-sm">{msg.text}</span>
        </div>
      )}

      {/* Upload / edit form */}
      {formOpen && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit Record track" : "Upload Record track"}
              </h2>
              <button
                onClick={() => { setFormOpen(false); resetForm() }}
                className="text-gray-500 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <FieldLabel label="Title">
              <Input
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="PEPE (Chart Swallower)"
                maxLength={120}
              />
            </FieldLabel>

            <FieldLabel
              label="Artist name"
              sub="Free-text — any name you like. Not tied to the 7-persona roster."
            >
              <Input
                value={draft.artist}
                onChange={e => setDraft(d => ({ ...d, artist: e.target.value }))}
                placeholder="Kiln Ghost"
                maxLength={80}
              />
            </FieldLabel>

            <FieldLabel label="Cover path" sub={`${IMAGE_CDN}/ ...`}>
              <Input
                value={draft.cover}
                onChange={e => setDraft(d => ({ ...d, cover: e.target.value }))}
                placeholder="/record-covers/pepe-chart.jpg"
                className="font-mono text-xs"
              />
              {draft.cover && (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={expandImageUrl(draft.cover)}
                    alt="Cover preview"
                    className="w-20 h-20 rounded-lg object-cover border border-gray-800"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                  <p className="text-xs text-gray-500 break-all">
                    {expandImageUrl(draft.cover)}
                  </p>
                </div>
              )}
            </FieldLabel>

            <FieldLabel label="Audio path" sub={`${AUDIO_CDN}/ ...`}>
              <Input
                value={draft.audio}
                onChange={e => {
                  const v = e.target.value
                  setDraft(d => ({ ...d, audio: v }))
                  if (v) triggerDurationDetect(v)
                }}
                placeholder="/record-audio/pepe-chart.m4a"
                className="font-mono text-xs"
              />
            </FieldLabel>

            <div className="grid grid-cols-2 gap-3">
              <FieldLabel
                label="Duration"
                sub={detectingDuration ? "Detecting…" : draft.duration ? "Auto-detected" : "Will auto-detect on save"}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={draft.duration || ""}
                    onChange={e => setDraft(d => ({ ...d, duration: parseInt(e.target.value || "0", 10) }))}
                    placeholder="0"
                    min={0}
                  />
                  <span className="text-xs text-gray-500 font-mono shrink-0">
                    {formatDuration(draft.duration)}
                  </span>
                  {detectingDuration && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                </div>
              </FieldLabel>

              <FieldLabel label="Mood tag" sub="Internal, doesn't show on Record">
                <select
                  value={draft.mood}
                  onChange={e => setDraft(d => ({ ...d, mood: e.target.value }))}
                  className="w-full px-3 py-2 h-10 text-sm bg-gray-900 border border-gray-800 rounded-md text-white focus:outline-none focus:border-gray-700"
                >
                  {MOODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </FieldLabel>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is-active"
                checked={draft.is_active}
                onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-700"
              />
              <label htmlFor="is-active" className="text-sm text-gray-300 cursor-pointer">
                Active (uncheck to soft-hide)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !canSubmit}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {editingId ? "Save changes" : "Upload track"}
              </Button>
              <Button variant="outline" onClick={() => { setFormOpen(false); resetForm() }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : tracks.length === 0 && !formOpen ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Music className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-400">No Record tracks uploaded yet.</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Upload your first one here. Once uploaded, head to Entries to pair it with a visiting artist and a commemorative text.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tracks.map(t => (
            <TrackCard
              key={t.id}
              track={t}
              onEdit={() => openEdit(t)}
              onRequestDelete={() => setConfirmingDelete(t.id)}
              onConfirmDelete={() => handleDelete(t.id)}
              onCancelDelete={() => setConfirmingDelete(null)}
              confirmingDelete={confirmingDelete === t.id}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TrackCard({
  track: t, onEdit, onRequestDelete, onConfirmDelete, onCancelDelete,
  confirmingDelete, saving,
}: {
  track: Track
  onEdit: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  confirmingDelete: boolean
  saving: boolean
}) {
  return (
    <Card className={!t.is_active ? "opacity-60" : ""}>
      <CardContent className="p-4">
        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">
              Delete <span className="font-semibold text-white">{t.title}</span>?
              <span className="block text-xs text-red-300/70 mt-0.5">
                Blocked if any Record entry uses this track.
              </span>
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="destructive" size="sm" onClick={onConfirmDelete} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelDelete}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {t.cover ? (
                <img
                  src={t.cover}
                  alt={t.title}
                  className="w-16 h-16 rounded-lg object-cover border border-gray-800"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center">
                  <Music className="w-5 h-5 text-gray-600" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <p className="font-semibold text-white">{t.title}</p>
                {!t.is_active && (
                  <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20 text-[10px]">
                    Hidden
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-400">by {t.artist}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Headphones className="w-3 h-3" />
                  {formatDuration(t.duration)}
                </span>
                <span className="font-mono truncate">{t.audio.replace(AUDIO_CDN, "")}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onEdit}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={onRequestDelete}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FieldLabel({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
        {sub && <span className="text-xs text-gray-600">{sub}</span>}
      </div>
      {children}
    </div>
  )
}
