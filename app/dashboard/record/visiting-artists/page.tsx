"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Users, Plus, Pencil, Trash2, Loader2, Save, X, ArrowLeft, AlertTriangle, CheckCircle2,
} from "lucide-react"

/**
 * /dashboard/record/visiting-artists
 *
 * List + create + edit + delete for visiting_artists — one-off
 * characters per Record entry.
 *
 * Flows:
 *   - Tap "New visiting artist" to open inline create form
 *   - Tap the pencil on any row to edit in place
 *   - Tap trash to confirm-delete. Blocked if any entries reference.
 */

interface Artist {
  id: number
  slug: string
  name: string
  bio: string
  imageUrl: string | null
  createdAt: string
  entryCount: number
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export default function VisitingArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  // create form state
  const [creating, setCreating] = useState(false)
  const [newSlug, setNewSlug] = useState("")
  const [newName, setNewName] = useState("")
  const [newBio, setNewBio] = useState("")
  const [newImage, setNewImage] = useState("")
  const [saving, setSaving] = useState(false)

  // edit state — one row at a time
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSlug, setEditSlug] = useState("")
  const [editName, setEditName] = useState("")
  const [editBio, setEditBio] = useState("")
  const [editImage, setEditImage] = useState("")

  // delete confirm
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/visiting-artists", { cache: "no-store" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMsg({ kind: "error", text: err.error || `Load failed: ${res.status}` })
        return
      }
      const data = await res.json()
      setArtists(data.artists || [])
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Load failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/visiting-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug, name: newName, bio: newBio, imageUrl: newImage || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Create failed" })
      } else {
        setMsg({ kind: "success", text: `Created "${data.artist.name}"` })
        setCreating(false)
        setNewSlug(""); setNewName(""); setNewBio(""); setNewImage("")
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  function startEdit(a: Artist) {
    setEditingId(a.id)
    setEditSlug(a.slug)
    setEditName(a.name)
    setEditBio(a.bio)
    setEditImage(a.imageUrl ?? "")
    setMsg(null)
  }

  async function handleSaveEdit() {
    if (!editingId || saving) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/visiting-artists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          slug: editSlug, name: editName, bio: editBio,
          imageUrl: editImage || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Update failed" })
      } else {
        setMsg({ kind: "success", text: `Updated "${data.artist.name}"` })
        setEditingId(null)
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
      const res = await fetch("/api/admin/visiting-artists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error || "Delete failed" })
      } else {
        setMsg({ kind: "success", text: "Deleted" })
        setConfirmingDelete(null)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb + header */}
      <Link href="/dashboard/record" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        The Record
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Visiting Artists</h1>
          <p className="text-gray-400 mt-1 text-sm">
            One-off characters who perform a single Record entry.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => { setCreating(true); setEditingId(null); setMsg(null) }}>
            <Plus className="w-4 h-4 mr-2" />
            New artist
          </Button>
        )}
      </div>

      {/* Message bar */}
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

      {/* Create form */}
      {creating && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New visiting artist</h2>
              <button
                onClick={() => { setCreating(false); setNewSlug(""); setNewName(""); setNewBio(""); setNewImage("") }}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <FieldLabel label="Display name" sub="Shown on the Record entry">
              <Input
                value={newName}
                onChange={e => {
                  setNewName(e.target.value)
                  if (!newSlug) setNewSlug(slugify(e.target.value))
                }}
                placeholder="Kiln Ghost"
                maxLength={80}
              />
            </FieldLabel>

            <FieldLabel label="Slug" sub="URL-safe identifier, auto-derived from name">
              <Input
                value={newSlug}
                onChange={e => setNewSlug(e.target.value.toLowerCase())}
                placeholder="kiln-ghost"
                maxLength={40}
                className="font-mono"
              />
            </FieldLabel>

            <FieldLabel label="Bio" sub={`${newBio.length} / 400 chars`}>
              <textarea
                value={newBio}
                onChange={e => setNewBio(e.target.value.slice(0, 400))}
                placeholder="Brief character bio. Appears with the Record entry."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-md text-white placeholder:text-gray-600 focus:outline-none focus:border-gray-700 resize-none"
              />
            </FieldLabel>

            <FieldLabel label="Image URL" sub="Optional. Full URL to a hosted image.">
              <Input
                value={newImage}
                onChange={e => setNewImage(e.target.value)}
                placeholder="https://apesonus-images.b-cdn.net/visiting-artists/kiln-ghost.jpg"
                className="font-mono text-xs"
              />
            </FieldLabel>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreate} disabled={saving || !newName || !newSlug || !newBio}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Create
              </Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewSlug(""); setNewName(""); setNewBio(""); setNewImage("") }}>
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
      ) : artists.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Users className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-400">No visiting artists yet.</p>
            <p className="text-xs text-gray-500 mt-1">Create one before composing a Record entry.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {artists.map(a => (
            <Card key={a.id} className={editingId === a.id ? "border-primary/30" : ""}>
              <CardContent className="p-4">
                {editingId === a.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Editing</span>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <FieldLabel label="Name">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={80} />
                    </FieldLabel>
                    <FieldLabel label="Slug">
                      <Input value={editSlug} onChange={e => setEditSlug(e.target.value.toLowerCase())} maxLength={40} className="font-mono" />
                    </FieldLabel>
                    <FieldLabel label="Bio" sub={`${editBio.length} / 400 chars`}>
                      <textarea
                        value={editBio}
                        onChange={e => setEditBio(e.target.value.slice(0, 400))}
                        rows={3}
                        className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-md text-white focus:outline-none focus:border-gray-700 resize-none"
                      />
                    </FieldLabel>
                    <FieldLabel label="Image URL">
                      <Input value={editImage} onChange={e => setEditImage(e.target.value)} className="font-mono text-xs" />
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveEdit} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : confirmingDelete === a.id ? (
                  // Delete confirm
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-red-400">
                      Delete <span className="font-semibold text-white">{a.name}</span>?
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(a.id)} disabled={saving}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div className="flex items-start gap-4">
                    {/* Image preview */}
                    <div className="shrink-0">
                      {a.imageUrl ? (
                        <img
                          src={a.imageUrl}
                          alt={a.name}
                          className="w-14 h-14 rounded-lg object-cover border border-gray-800"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center">
                          <Users className="w-5 h-5 text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <p className="font-semibold text-white">{a.name}</p>
                        <p className="text-xs text-gray-500 font-mono">@{a.slug}</p>
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2">{a.bio}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {a.entryCount > 0 ? (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                            {a.entryCount} {a.entryCount === 1 ? "entry" : "entries"}
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                            Unused
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(a)}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(a.id)}
                        disabled={a.entryCount > 0}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                        aria-label={a.entryCount > 0 ? "Cannot delete — in use" : "Delete"}
                        title={a.entryCount > 0 ? "Cannot delete — in use by Record entries" : "Delete"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
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
