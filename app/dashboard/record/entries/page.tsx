"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Disc3, Plus, Pencil, Trash2, Loader2, Save, X, ArrowLeft,
  AlertTriangle, CheckCircle2, Eye, EyeOff, Music, Users,
} from "lucide-react"

/**
 * /dashboard/record/entries
 *
 * List + compose + edit + delete Record entries. This is the main
 * working surface for seeding the app's Record content.
 *
 * Flow to create a new entry:
 *   1. Upload the track on /dashboard/tracks (existing flow)
 *   2. Create the visiting artist on /dashboard/record/visiting-artists
 *   3. Come here, click "New entry"
 *   4. Pick zone → pick artist → pick track → write text → save
 *
 * The composer auto-flips the attached track's is_record_only=true
 * server-side so it doesn't pollute the main catalog.
 */

type Zone = "coin_of_month" | "celebration" | "funeral"

const ZONE_META: Record<Zone, { label: string; color: string; accent: string }> = {
  coin_of_month: { label: "Coin of the Month", color: "text-yellow-500",  accent: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  celebration:   { label: "Celebration",       color: "text-green-500",   accent: "bg-green-500/10 text-green-400 border-green-500/20" },
  funeral:       { label: "Graveyard",         color: "text-gray-400",    accent: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
}

interface VisitingArtist {
  id: number
  slug: string
  name: string
}

interface TrackSummary {
  id: number
  title: string
  artist: string
  cover: string
  isRecordOnly: boolean
}

interface Entry {
  id: number
  zone: Zone
  projectName: string
  projectKey: string
  visitingArtistId: number
  trackId: number
  commemorativeText: string
  coinOfMonthFor: string | null
  publishedAt: string
  isActive: boolean
  visitingArtist: { id: number; slug: string; name: string } | null
  track: { id: number; title: string; artist: string; cover: string } | null
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

function firstOfMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

export default function RecordEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [artists, setArtists] = useState<VisitingArtist[]>([])
  const [tracks, setTracks] = useState<TrackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state — shared by create + edit
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [zone, setZone] = useState<Zone>("celebration")
  const [projectName, setProjectName] = useState("")
  const [projectKey, setProjectKey] = useState("")
  const [visitingArtistId, setVisitingArtistId] = useState<number | "">("")
  const [trackId, setTrackId] = useState<number | "">("")
  const [commemorativeText, setCommemorativeText] = useState("")
  const [coinOfMonthFor, setCoinOfMonthFor] = useState(firstOfMonthISO())
  const [isActive, setIsActive] = useState(true)

  // Delete confirm
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [entriesRes, artistsRes, tracksRes] = await Promise.all([
        fetch("/api/admin/record-entries", { cache: "no-store" }),
        fetch("/api/admin/visiting-artists", { cache: "no-store" }),
        fetch("/api/admin/record-tracks", { cache: "no-store" }),
      ])
      const entriesData = await entriesRes.json()
      const artistsData = await artistsRes.json()
      const tracksData = await tracksRes.json()

      if (entriesRes.ok) setEntries(entriesData.entries ?? [])
      if (artistsRes.ok) setArtists(artistsData.artists ?? [])
      if (tracksRes.ok) setTracks(tracksData.tracks ?? [])

      if (!entriesRes.ok) setMsg({ kind: "error", text: entriesData.error || "Failed to load entries" })
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Load failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  function resetForm() {
    setEditingId(null)
    setZone("celebration")
    setProjectName(""); setProjectKey("")
    setVisitingArtistId(""); setTrackId("")
    setCommemorativeText("")
    setCoinOfMonthFor(firstOfMonthISO())
    setIsActive(true)
  }

  function openNew() {
    resetForm()
    setFormOpen(true)
    setMsg(null)
  }

  function openEdit(e: Entry) {
    setEditingId(e.id)
    setZone(e.zone)
    setProjectName(e.projectName)
    setProjectKey(e.projectKey)
    setVisitingArtistId(e.visitingArtistId)
    setTrackId(e.trackId)
    setCommemorativeText(e.commemorativeText)
    setCoinOfMonthFor(e.coinOfMonthFor || firstOfMonthISO())
    setIsActive(e.isActive)
    setFormOpen(true)
    setMsg(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function handleSave() {
    if (saving) return
    setSaving(true); setMsg(null)

    const payload = {
      zone,
      projectName,
      projectKey,
      visitingArtistId,
      trackId,
      commemorativeText,
      coinOfMonthFor: zone === "coin_of_month" ? coinOfMonthFor : null,
      isActive,
    }

    try {
      const url = "/api/admin/record-entries"
      const method = editingId ? "PATCH" : "POST"
      const body = editingId ? { ...payload, id: editingId } : payload

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Save failed" })
      } else {
        setMsg({ kind: "success", text: editingId ? "Entry updated" : `Published ${data.entry.projectName}` })
        setFormOpen(false)
        resetForm()
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/record-entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Delete failed" })
      } else {
        setMsg({ kind: "success", text: "Entry deleted" })
        setConfirmingDelete(null)
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(entry: Entry) {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/record-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, isActive: !entry.isActive }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Update failed" })
      } else {
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  const grouped = {
    coin_of_month: entries.filter(e => e.zone === "coin_of_month"),
    celebration:   entries.filter(e => e.zone === "celebration"),
    funeral:       entries.filter(e => e.zone === "funeral"),
  }

  const canSubmit =
    projectName.trim().length > 0 &&
    projectKey.trim().length > 0 &&
    visitingArtistId !== "" &&
    trackId !== "" &&
    commemorativeText.trim().length >= 10 &&
    (zone !== "coin_of_month" || coinOfMonthFor)

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/record" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        The Record
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Entries</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Songs that appear on The Record.
          </p>
        </div>
        {!formOpen && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            New entry
          </Button>
        )}
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 flex items-center gap-2 ${
            msg.kind === "error"
              ? "bg-red-500/10 border border-red-500/30 text-red-400"
              : "bg-green-500/10 border border-green-500/30 text-green-400"
          }`}
        >
          {msg.kind === "error" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="text-sm">{msg.text}</span>
        </div>
      )}

      {/* Composer form */}
      {formOpen && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit entry" : "New Record entry"}
              </h2>
              <button
                onClick={() => { setFormOpen(false); resetForm() }}
                className="text-gray-500 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Zone picker */}
            <FieldLabel label="Zone">
              <div className="grid grid-cols-3 gap-2">
                {(["coin_of_month", "celebration", "funeral"] as Zone[]).map(z => (
                  <button
                    key={z}
                    onClick={() => setZone(z)}
                    className={`py-2.5 rounded-md text-sm font-medium transition-colors border ${
                      zone === z
                        ? ZONE_META[z].accent
                        : "bg-gray-900 border-gray-800 text-gray-500 hover:text-white hover:border-gray-700"
                    }`}
                  >
                    {ZONE_META[z].label}
                  </button>
                ))}
              </div>
            </FieldLabel>

            {/* CoM date (conditional) */}
            {zone === "coin_of_month" && (
              <FieldLabel label="Coin of the Month date" sub="First of the month (YYYY-MM-DD)">
                <Input
                  type="date"
                  value={coinOfMonthFor}
                  onChange={e => setCoinOfMonthFor(e.target.value)}
                />
              </FieldLabel>
            )}

            {/* Project name + key */}
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Project name">
                <Input
                  value={projectName}
                  onChange={e => {
                    setProjectName(e.target.value)
                    if (!editingId && (!projectKey || projectKey === slugify(projectName))) {
                      setProjectKey(slugify(e.target.value))
                    }
                  }}
                  placeholder="PEPE"
                  maxLength={80}
                />
              </FieldLabel>
              <FieldLabel label="Project key" sub="lowercase identifier">
                <Input
                  value={projectKey}
                  onChange={e => setProjectKey(e.target.value.toLowerCase())}
                  placeholder="pepe"
                  maxLength={40}
                  className="font-mono"
                />
              </FieldLabel>
            </div>

            {/* Visiting artist picker */}
            <FieldLabel
              label="Visiting artist"
              sub={artists.length === 0 ? "No artists yet — create one first" : undefined}
            >
              <select
                value={visitingArtistId}
                onChange={e => setVisitingArtistId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-md text-white focus:outline-none focus:border-gray-700"
              >
                <option value="">— Choose visiting artist —</option>
                {artists.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (@{a.slug})</option>
                ))}
              </select>
              {artists.length === 0 && (
                <Link
                  href="/dashboard/record/visiting-artists"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Create a visiting artist →
                </Link>
              )}
            </FieldLabel>

            {/* Track picker */}
            <FieldLabel
              label="Track"
              sub="The track gets flagged is_record_only on save"
            >
              <select
                value={trackId}
                onChange={e => setTrackId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-md text-white focus:outline-none focus:border-gray-700"
              >
                <option value="">— Choose track —</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.artist}{t.isRecordOnly ? " · record-only" : ""}
                  </option>
                ))}
              </select>
              {tracks.length === 0 && (
                <Link
                  href="/dashboard/tracks"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Upload a track first →
                </Link>
              )}
            </FieldLabel>

            {/* Commemorative text */}
            <FieldLabel
              label="Commemorative text"
              sub={`${commemorativeText.length} / 500 chars · min 10`}
            >
              <textarea
                value={commemorativeText}
                onChange={e => setCommemorativeText(e.target.value.slice(0, 500))}
                placeholder="The frog that ate the chart and never gave it back. April belonged to it."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-md text-white placeholder:text-gray-600 focus:outline-none focus:border-gray-700 resize-none"
              />
            </FieldLabel>

            {/* Publish toggle */}
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is-active"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-700"
              />
              <label htmlFor="is-active" className="text-sm text-gray-300 cursor-pointer">
                Publish immediately
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !canSubmit}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {editingId ? "Save changes" : "Create entry"}
              </Button>
              <Button variant="outline" onClick={() => { setFormOpen(false); resetForm() }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry list grouped by zone */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : entries.length === 0 && !formOpen ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Disc3 className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-400">No Record entries yet.</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Before creating your first entry: upload the track on the Tracks page,
              then create the visiting artist.
            </p>
          </CardContent>
        </Card>
      ) : (
        (["coin_of_month", "celebration", "funeral"] as Zone[]).map(z => {
          const list = grouped[z]
          if (list.length === 0) return null
          return (
            <div key={z} className="mb-6">
              <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 ${ZONE_META[z].color}`}>
                {ZONE_META[z].label} · {list.length}
              </h2>
              <div className="space-y-3">
                {list.map(entry => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onEdit={() => openEdit(entry)}
                    onDelete={() => setConfirmingDelete(entry.id)}
                    onToggleActive={() => handleToggleActive(entry)}
                    confirmingDelete={confirmingDelete === entry.id}
                    onConfirmDelete={() => handleDelete(entry.id)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    saving={saving}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function EntryCard({
  entry, onEdit, onDelete, onToggleActive,
  confirmingDelete, onConfirmDelete, onCancelDelete,
  saving,
}: {
  entry: Entry
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  confirmingDelete: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
  saving: boolean
}) {
  return (
    <Card className={!entry.isActive ? "opacity-60" : ""}>
      <CardContent className="p-4">
        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">
              Delete <span className="font-semibold text-white">{entry.projectName}</span>?
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
            {/* Cover */}
            <div className="shrink-0">
              {entry.track?.cover ? (
                <img
                  src={entry.track.cover}
                  alt={entry.track.title}
                  className="w-16 h-16 rounded-lg object-cover border border-gray-800"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center">
                  <Music className="w-5 h-5 text-gray-600" />
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <p className="font-semibold text-white">{entry.projectName}</p>
                <p className="text-xs text-gray-500 font-mono">${entry.projectKey}</p>
                {!entry.isActive && (
                  <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20 text-[10px]">
                    Unpublished
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                by {entry.visitingArtist?.name || "?"}
                {entry.track && <> · <Music className="w-3 h-3" /> {entry.track.title}</>}
                {entry.coinOfMonthFor && (
                  <> · {new Date(entry.coinOfMonthFor).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>
                )}
              </p>
              <p className="text-sm text-gray-400 line-clamp-2">{entry.commemorativeText}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onToggleActive}
                disabled={saving}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-30"
                title={entry.isActive ? "Unpublish" : "Publish"}
                aria-label={entry.isActive ? "Unpublish" : "Publish"}
              >
                {entry.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                onClick={onEdit}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
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
