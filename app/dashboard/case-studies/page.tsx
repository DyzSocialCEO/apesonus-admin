"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, Plus, Trash2, Film } from "lucide-react"

/**
 * CASE STUDIES.
 *
 * Upload the clip to Bunny, paste the URL here, give it a title and a line.
 * Same shape as adding a track. Nothing is uploaded through this page.
 */

interface Clip {
  id: number
  title: string
  line: string
  url: string
  poster: string
  seconds: number
  sort: number
  live: boolean
}

const BLANK: Omit<Clip, "id"> = {
  title: "",
  line: "",
  url: "",
  poster: "",
  seconds: 0,
  sort: 0,
  live: true,
}

export default function CaseStudiesPage() {
  const [clips, setClips] = useState<Clip[]>([])
  const [draft, setDraft] = useState(BLANK)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const r = await fetch("/api/admin/case-studies", { cache: "no-store" })
      const d = await r.json()
      setClips(Array.isArray(d.clips) ? d.clips : [])
    } catch {
      setError("Could not read the clips.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const post = async (tag: string, payload: Record<string, unknown>) => {
    if (busy) return
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/case-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Could not save.")
      setSaved(tag)
      setTimeout(() => setSaved(""), 1600)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
      return false
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Case Studies</h1>
        <p className="text-sm text-gray-500">
          The screen in the waiting room. Put the clip on Bunny, then paste the URL here.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-gray-400">
            <Plus className="h-4 w-4" /> Add a clip
          </CardTitle>
          <CardDescription>
            Sixteen by nine, around thirty seconds. The poster is optional and shows before it plays.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Title</label>
              <Input
                value={draft.title}
                placeholder="The Job Interview"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Length in seconds</label>
              <Input
                type="number"
                value={draft.seconds}
                onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Bunny URL for the video</label>
            <Input
              value={draft.url}
              placeholder="https://apesonus.b-cdn.net/case-studies/job-interview.mp4"
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Poster image, optional</label>
            <Input
              value={draft.poster}
              placeholder="https://apesonus-images.b-cdn.net/case-studies/job-interview.jpg"
              onChange={(e) => setDraft({ ...draft, poster: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">One line under the title</label>
            <Input
              value={draft.line}
              placeholder="There is a four year gap on your CV."
              onChange={(e) => setDraft({ ...draft, line: e.target.value })}
            />
          </div>

          <button
            type="button"
            disabled={busy === "add"}
            onClick={async () => {
              const ok = await post("add", { ...draft, id: null })
              if (ok) setDraft(BLANK)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add it
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-gray-400">
            <Film className="h-4 w-4" /> On the screen
            <span className="ml-auto text-xs font-normal text-gray-500">{clips.length}</span>
          </CardTitle>
          <CardDescription>
            Lowest order shows first. Switch one off and it comes down without being deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500">Reading the file.</p>
          ) : clips.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on the screen yet.</p>
          ) : (
            clips.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border p-3 ${c.live ? "border-gray-800" : "border-gray-900 opacity-60"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{c.title || `Case ${c.id}`}</span>
                  {!c.live ? <span className="text-[11px] text-gray-500">OFF THE SCREEN</span> : null}
                  <span className="ml-auto font-mono text-xs text-gray-600">{c.seconds}s</span>
                </div>

                <p className="mt-1 truncate font-mono text-[11px] text-gray-600">{c.url}</p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Input
                    defaultValue={c.title}
                    onBlur={(e) =>
                      e.target.value !== c.title && post(`t-${c.id}`, { ...c, title: e.target.value })
                    }
                  />
                  <Input
                    defaultValue={c.line}
                    placeholder="One line under the title"
                    onBlur={(e) => e.target.value !== c.line && post(`l-${c.id}`, { ...c, line: e.target.value })}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => post(`v-${c.id}`, { ...c, live: !c.live })}
                    className="rounded border border-gray-700 px-2 py-1 font-semibold text-gray-300 hover:border-green-800 hover:text-green-400"
                  >
                    {c.live ? "TAKE IT DOWN" : "PUT IT UP"}
                  </button>

                  <label className="flex items-center gap-2 text-gray-500">
                    Order
                    <Input
                      type="number"
                      defaultValue={c.sort}
                      onBlur={(e) =>
                        Number(e.target.value) !== c.sort && post(`s-${c.id}`, { ...c, sort: Number(e.target.value) })
                      }
                      className="w-20"
                    />
                  </label>

                  {saved.endsWith(String(c.id)) ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete ${c.title || "this clip"}? The file on Bunny is not touched.`)) {
                        post(`d-${c.id}`, { what: "delete", id: c.id })
                      }
                    }}
                    className="ml-auto rounded border border-gray-800 p-1.5 text-gray-500 hover:border-red-900 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
