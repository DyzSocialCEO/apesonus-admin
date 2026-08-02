"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Save, AlertTriangle, CheckCircle2, Users, Plus, Pencil } from "lucide-react"
import { slugifyArtistName, CODE_ARTISTS } from "@/lib/constants/roster-list"

const IMAGE_CDN = "https://apesonus-images.b-cdn.net"

// Mirrors the helpers in app/dashboard/tracks/page.tsx so the UX
// feels identical to the existing track editor: admin pastes a
// short path, preview uses the CDN-prefixed URL.
function expandImageUrl(input: string): string {
  if (!input) return ""
  if (input.startsWith("http")) return input
  return `${IMAGE_CDN}${input.startsWith("/") ? "" : "/"}${input}`
}

function shortenUrl(url: string, base: string): string {
  if (!url) return ""
  return url.replace(base, "")
}

interface ArtistSummary {
  id: string
  name: string
  trackCount: number
  dominantCover: string
  mixed: boolean
  distinctCovers: string[]
}

interface DbArtist {
  id: string
  name: string
  tagline: string
  backstory: string
  gender: string | null
  moods: string[]
  take_prompt: string
  companion_bible: string
  image: string | null
  sort_order: number
  is_active: boolean
}

const ALL_MOODS = ["moon", "rekt", "cope", "degen", "zen"]

const emptyArtist: Partial<DbArtist> = {
  name: "", tagline: "", backstory: "", gender: "", moods: [...ALL_MOODS],
  take_prompt: "", companion_bible: "", image: "", sort_order: 0, is_active: true,
}

export default function ArtistCoversPage() {
  const [artists, setArtists] = useState<ArtistSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

  // ─── ADD ARTIST ────────────────────────────────────────────────
  const [dbArtists, setDbArtists] = useState<DbArtist[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<DbArtist>>(emptyArtist)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingArtist, setSavingArtist] = useState(false)
  const [isOverride, setIsOverride] = useState(false)

  const loadDbArtists = async () => {
    try {
      const res = await fetch("/api/admin/artists", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setDbArtists(data.dbArtists || [])
    } catch { /* section just stays empty */ }
  }
  useEffect(() => { loadDbArtists() }, [])

  const CODE_IDS = new Set<string>(CODE_ARTISTS.map(a => a.id))
  const createdArtists = dbArtists.filter(a => !CODE_IDS.has(a.id))

  const openCreate = () => { setEditingId(null); setIsOverride(false); setForm(emptyArtist); setShowForm(true) }

  // Edit a CODE artist: the form writes an override row under their id.
  // Prefill from the existing override if there is one; empty = code version.
  const openCodeEdit = (id: string, name: string) => {
    const row = dbArtists.find(a => a.id === id)
    setEditingId(id)
    setIsOverride(true)
    setForm({
      name,
      tagline: row?.tagline || "",
      backstory: row?.backstory || "",
      gender: row?.gender || "",
      image: row?.image ? shortenUrl(row.image, IMAGE_CDN) : "",
    })
    setShowForm(true)
  }
  const openEdit = (a: DbArtist) => {
    setEditingId(a.id)
    setIsOverride(false)
    setForm({ ...a, gender: a.gender || "", image: a.image ? shortenUrl(a.image, IMAGE_CDN) : "" })
    setShowForm(true)
  }

  const toggleMood = (m: string) => {
    const current = form.moods || []
    setForm({ ...form, moods: current.includes(m) ? current.filter(x => x !== m) : [...current, m] })
  }

  const saveArtist = async () => {
    const name = (form.name || "").trim()
    if (!name) { setMsg("Name is required"); return }
    setSavingArtist(true)
    try {
      const payload = {
        ...form,
        name,
        image: form.image ? expandImageUrl(form.image) : "",
        id: editingId || undefined,
      }
      const res = await fetch("/api/admin/artists", {
        method: editingId || isOverride ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || "Save failed"); return }
      setMsg(editingId || isOverride ? `Updated ${name} — the app picks it up within a minute` : `${name} joins the staff — add their first track and they go live`)
      setShowForm(false)
      await loadDbArtists()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingArtist(false)
    }
  }

  const toggleActive = async (a: DbArtist) => {
    try {
      const res = await fetch("/api/admin/artists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
      })
      if (res.ok) await loadDbArtists()
    } catch { /* leave as-is */ }
  }

  // Local draft of the cover path per artist, keyed by artist id.
  // Starts empty, gets primed with dominantCover on first load.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // Per-card saving state so admins can only start one update at a time
  // per row (prevents double-click sending two UPDATEs back to back).
  const [savingId, setSavingId] = useState<string | null>(null)

  // Confirm step: holds the id of the artist we're about to bulk-update.
  // The card swaps its button for "Yes, update all N tracks" + "Cancel".
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const loadArtists = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/artist-covers", { cache: "no-store" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMsg(err.error || `Load failed: ${res.status}`)
        return
      }
      const data = await res.json()
      setArtists(data.artists || [])
      // Prime drafts with the short form of the dominant cover so the
      // input field starts populated with what's currently live.
      const nextDrafts: Record<string, string> = {}
      for (const a of data.artists || []) {
        nextDrafts[a.id] = shortenUrl(a.dominantCover || "", IMAGE_CDN)
      }
      setDrafts(nextDrafts)
    } catch (e: any) {
      setMsg(e?.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadArtists() }, [])

  const handleUpdate = async (artist: ArtistSummary) => {
    const draft = (drafts[artist.id] || "").trim()
    if (!draft) {
      setMsg("Cover path cannot be empty")
      return
    }
    setSavingId(artist.id)
    setMsg("")
    try {
      const res = await fetch("/api/admin/artist-covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: artist.name,
          // Store as the short form if it starts with the CDN prefix;
          // otherwise store whatever the admin typed. The main app's
          // expandImageUrl handles both cases identically.
          coverPath: draft.startsWith("http") ? draft : draft,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.error || `Update failed: ${res.status}`)
        return
      }
      setMsg(`Updated ${data.updatedCount} ${artist.name} track${data.updatedCount === 1 ? "" : "s"}`)
      setConfirmingId(null)
      await loadArtists()
    } catch (e: any) {
      setMsg(e?.message || "Update failed")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Artists</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload a new image to BunnyCDN via the dashboard, then paste the path here. One save updates every track under that artist.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Artist
        </Button>
      </div>

      {createdArtists.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-gray-500">Created from admin</p>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {createdArtists.map(a => (
              <Card key={a.id} className={`bg-gray-900/60 border-gray-800 ${a.is_active ? "" : "opacity-50"}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  {a.image ? (
                    <img src={a.image} alt={a.name} className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{a.name}</p>
                    <p className="text-xs text-gray-500 truncate">{a.tagline || a.id}</p>
                    {!a.is_active && <p className="text-[10px] text-red-400 mt-0.5">HIDDEN — not in dropdown or app</p>}
                  </div>
                  <button onClick={() => openEdit(a)} className="p-2 text-gray-400 hover:text-white" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(a)}
                    className={`text-[10px] px-2 py-1 rounded border ${a.is_active ? "border-gray-700 text-gray-400 hover:text-white" : "border-yellow-700 text-yellow-500"}`}
                  >
                    {a.is_active ? "HIDE" : "SHOW"}
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3 text-sm text-gray-200">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading artist roster...
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {artists.map(artist => {
            const draft = drafts[artist.id] ?? ""
            const previewUrl = expandImageUrl(draft)
            const currentUrl = artist.dominantCover
            const hasChange = (draft || "").trim() !== shortenUrl(currentUrl || "", IMAGE_CDN).trim()
            const isSaving = savingId === artist.id
            const isConfirming = confirmingId === artist.id
            return (
              <Card key={artist.id} className="bg-gray-900/60 border-gray-800">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    {currentUrl ? (
                      // Current live cover thumbnail on the left.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currentUrl} alt={artist.name} className="w-14 h-14 rounded-lg object-cover bg-gray-800 shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center">
                        <Users className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold truncate flex items-center gap-2">
                        {artist.name}
                        <button
                          onClick={() => {
                            const db = dbArtists.find(d => d.id === artist.id)
                            if (db && !CODE_IDS.has(artist.id)) { openEdit(db) } else { openCodeEdit(artist.id, artist.name) }
                          }}
                          className="p-1 text-gray-500 hover:text-white shrink-0"
                          title="Edit bio"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {artist.trackCount} track{artist.trackCount === 1 ? "" : "s"}
                      </p>
                      {artist.mixed && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {artist.distinctCovers.length} different covers in use
                        </p>
                      )}
                      {!artist.mixed && currentUrl && (
                        <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          All tracks aligned
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="shrink-0">{IMAGE_CDN}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={draft}
                        onChange={(e) => setDrafts({ ...drafts, [artist.id]: e.target.value })}
                        placeholder="/images-rekterapy/artist.png"
                        disabled={isSaving || isConfirming}
                      />
                      {previewUrl && hasChange && (
                        // Preview of the NEW draft image the admin is about to save.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0" />
                      )}
                    </div>
                  </div>

                  {!isConfirming ? (
                    <Button
                      className="w-full"
                      disabled={!hasChange || isSaving || artist.trackCount === 0}
                      onClick={() => {
                        setConfirmingId(artist.id)
                        setMsg("")
                      }}
                    >
                      {artist.trackCount === 0
                        ? "No tracks for this artist"
                        : `Apply to ${artist.trackCount} track${artist.trackCount === 1 ? "" : "s"}`}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                        This will overwrite the cover on all {artist.trackCount} {artist.name} track{artist.trackCount === 1 ? "" : "s"}. Confirm to proceed.
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          disabled={isSaving}
                          onClick={() => handleUpdate(artist)}
                        >
                          {isSaving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</>
                          ) : (
                            <><Save className="w-4 h-4 mr-2" /> Yes, update all</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={isSaving}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── ADD / EDIT ARTIST MODAL ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8 px-4">
          <div className="w-full max-w-xl bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{isOverride ? `Edit ${form.name}` : editingId ? "Edit Artist" : "Add New Artist"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Name *</label>
              <Input
                value={form.name || ""}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Artist name"
                disabled={!!editingId || isOverride}
                className="bg-gray-800 border-gray-700 text-white"
              />
              {isOverride && (
                <p className="text-[10px] text-gray-500 mt-1">
                  This artist lives in code. Anything you write here replaces what the app shows; leave a field empty to keep the original.
                </p>
              )}
              {!editingId && (form.name || "").trim() && (
                <p className="text-[10px] text-gray-500 mt-1">
                  URL id will be <span className="text-gray-300">{slugifyArtistName(form.name || "")}</span> — it cannot change later.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Tagline</label>
              <Input
                value={form.tagline || ""}
                onChange={e => setForm({ ...form, tagline: e.target.value })}
                placeholder="One line under their name"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Backstory</label>
              <textarea
                value={form.backstory || ""}
                onChange={e => setForm({ ...form, backstory: e.target.value })}
                rows={5}
                placeholder="Who they are. Same voice as the existing profiles."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Gender / pronouns <span className="text-gray-500">(optional)</span></label>
              <Input
                value={form.gender || ""}
                onChange={e => setForm({ ...form, gender: e.target.value })}
                placeholder={"e.g. woman · man · androgynous, they/them"}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {!isOverride && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Mood worlds</label>
              <div className="flex flex-wrap gap-2">
                {ALL_MOODS.map(m => {
                  const on = (form.moods || []).includes(m)
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMood(m)}
                      className={`px-3 py-1 rounded-full text-xs uppercase tracking-wide border ${on ? "bg-yellow-600 text-black border-yellow-600 font-semibold" : "border-gray-700 text-gray-400"}`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Their typical territory — any artist can still release in any mood.</p>
            </div>
            )}

            {!isOverride && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Weekly take prompt <span className="text-gray-500">(optional)</span></label>
              <textarea
                value={form.take_prompt || ""}
                onChange={e => setForm({ ...form, take_prompt: e.target.value })}
                rows={2}
                placeholder="You are [name] — ... Write your weekly market take in 2-3 sentences."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            )}

            {!isOverride && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Companion bible <span className="text-gray-500">(optional)</span></label>
              <textarea
                value={form.companion_bible || ""}
                onChange={e => setForm({ ...form, companion_bible: e.target.value })}
                rows={4}
                placeholder="WHO THEY ARE: ... VOICE: ... IN EACH SCENARIO: ..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Portrait image <span className="text-gray-500">(optional)</span></label>
              <Input
                value={form.image || ""}
                onChange={e => setForm({ ...form, image: e.target.value })}
                placeholder="/images-rekterapy/artist.png"
                className="bg-gray-800 border-gray-700 text-white"
              />
              <p className="text-[10px] text-gray-500 mt-1">Leave empty and the app uses their first track&apos;s cover, same as everyone else.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="border-gray-700 text-gray-300">Cancel</Button>
              <Button onClick={saveArtist} disabled={savingArtist} className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold">
                {savingArtist ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                {editingId || isOverride ? "Save Changes" : "Create Artist"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
