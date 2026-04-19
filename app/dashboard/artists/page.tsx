"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Save, AlertTriangle, CheckCircle2, Users } from "lucide-react"

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

export default function ArtistCoversPage() {
  const [artists, setArtists] = useState<ArtistSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

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
          <h1 className="text-2xl font-bold text-white">Artist Covers</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload a new image to BunnyCDN via the dashboard, then paste the path here. One save updates every track under that artist.
          </p>
        </div>
      </div>

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
                      <p className="text-white font-semibold truncate">{artist.name}</p>
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
    </div>
  )
}
