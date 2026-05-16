"use client"

/**
 * /dashboard/field-notes — author + manage Field Notes stories.
 *
 * Left: list of all stories (draft + published) with status.
 * Right: editor for the selected story — metadata, cover URL,
 * an ordered list of cards (image URL + text each), reorder/remove,
 * and a Draft/Publish toggle.
 *
 * Images: paste a URL (Bunny CDN or any https). No upload widget in
 * v1 — operator drops the URL.
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  BookOpen, Plus, Trash2, ArrowUp, ArrowDown, Save, Loader2,
  Eye, EyeOff, FileText,
} from "lucide-react"

interface StoryRow {
  id: number
  title: string
  series_name: string | null
  episode_number: number | null
  status: string
  card_count: number
}
interface CardRow { image_url: string; body_text: string }
interface FullStory {
  id: number
  title: string
  series_name: string | null
  episode_number: number | null
  excerpt: string | null
  cover_image_url: string | null
  status: string
}

export default function FieldNotesAdmin() {
  const [list, setList] = useState<StoryRow[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [story, setStory] = useState<FullStory | null>(null)
  const [cards, setCards] = useState<CardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    const r = await fetch("/api/admin/field-notes", { credentials: "include" })
    const j = await r.json()
    setList(j.stories ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { loadList() }, [loadList])

  const openStory = async (id: number) => {
    setSel(id); setMsg(null)
    const r = await fetch(`/api/admin/field-notes/${id}`, { credentials: "include" })
    const j = await r.json()
    setStory(j.story)
    setCards((j.cards ?? []).map((c: { image_url: string|null; body_text: string|null }) => ({
      image_url: c.image_url ?? "", body_text: c.body_text ?? "",
    })))
  }

  const createStory = async () => {
    const title = prompt("Story title?")
    if (!title) return
    const r = await fetch("/api/admin/field-notes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ title }),
    })
    const j = await r.json()
    if (j.id) { await loadList(); openStory(j.id) }
  }

  const save = async () => {
    if (!story) return
    setSaving(true); setMsg(null)
    const r = await fetch(`/api/admin/field-notes/${story.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ story, cards }),
    })
    const j = await r.json()
    setSaving(false)
    if (!r.ok) { setMsg(j.error ?? "Save failed"); return }
    setMsg("Saved.")
    loadList()
  }

  const togglePublish = async () => {
    if (!story) return
    const next = story.status === "published" ? "draft" : "published"
    const updated = { ...story, status: next }
    setStory(updated)
    setSaving(true)
    const r = await fetch(`/api/admin/field-notes/${story.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ story: { status: next } }),
    })
    setSaving(false)
    if (r.ok) { setMsg(next === "published" ? "Published — live on the app." : "Unpublished."); loadList() }
  }

  const del = async () => {
    if (!story || !confirm("Delete this story and all its cards?")) return
    await fetch(`/api/admin/field-notes/${story.id}`, { method: "DELETE", credentials: "include" })
    setSel(null); setStory(null); setCards([]); loadList()
  }

  const setCardField = (i: number, k: keyof CardRow, v: string) =>
    setCards((cs: CardRow[]) => cs.map((c: CardRow, j: number) => j === i ? { ...c, [k]: v } : c))
  const addCard = () => setCards((cs: CardRow[]) => [...cs, { image_url: "", body_text: "" }])
  const rmCard = (i: number) => setCards((cs: CardRow[]) => cs.filter((_: CardRow, j: number) => j !== i))
  const move = (i: number, d: -1 | 1) => setCards((cs: CardRow[]) => {
    const n = [...cs]; const t = i + d
    if (t < 0 || t >= n.length) return cs
    ;[n[i], n[t]] = [n[t], n[i]]; return n
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-white">
        <BookOpen className="h-5 w-5 text-yellow-500" />
        <h1 className="text-2xl font-bold">Field Notes</h1>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-5">
        {/* list */}
        <Card className="bg-gray-900 border-gray-800 h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white text-sm">Stories</CardTitle>
            <button onClick={createStory} className="text-yellow-500 hover:text-yellow-400">
              <Plus className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            ) : list.length === 0 ? (
              <p className="text-xs text-gray-500">No stories yet. Click + to start.</p>
            ) : list.map((s) => (
              <button
                key={s.id}
                onClick={() => openStory(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${sel === s.id ? "bg-yellow-500/10 text-white" : "text-gray-400 hover:bg-gray-800"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate">{s.title}</span>
                  {s.status === "published"
                    ? <Badge className="bg-green-500/15 text-green-400 text-[10px]">Live</Badge>
                    : <Badge className="bg-gray-700 text-gray-300 text-[10px]">Draft</Badge>}
                </div>
                <div className="text-[11px] text-gray-600 mt-0.5">{s.card_count} cards</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* editor */}
        {story ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title">
                  <Input value={story.title} onChange={(e) => setStory({ ...story, title: e.target.value })}
                    className="bg-gray-950 border-gray-800 text-white" />
                </Field>
                <Field label="Cover image URL">
                  <Input value={story.cover_image_url ?? ""} onChange={(e) => setStory({ ...story, cover_image_url: e.target.value })}
                    placeholder="https://..." className="bg-gray-950 border-gray-800 text-white font-mono text-xs" />
                </Field>
                <Field label="Series name (optional)">
                  <Input value={story.series_name ?? ""} onChange={(e) => setStory({ ...story, series_name: e.target.value })}
                    placeholder="The Boy Who Sold The Top" className="bg-gray-950 border-gray-800 text-white" />
                </Field>
                <Field label="Episode # (optional)">
                  <Input type="number" value={story.episode_number ?? ""} onChange={(e) => setStory({ ...story, episode_number: e.target.value ? Number(e.target.value) : null })}
                    className="bg-gray-950 border-gray-800 text-white" />
                </Field>
              </div>
              <Field label="Excerpt (shown on the card)">
                <textarea value={story.excerpt ?? ""} onChange={(e) => setStory({ ...story, excerpt: e.target.value })}
                  rows={2} className="w-full bg-gray-950 border border-gray-800 rounded-md text-white text-sm p-2" />
              </Field>

              <div className="border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-yellow-500" /> Cards ({cards.length})
                  </span>
                  <button onClick={addCard} className="text-xs text-yellow-500 hover:text-yellow-400 flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add card
                  </button>
                </div>
                <div className="space-y-3">
                  {cards.map((c, i) => (
                    <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-gray-500 font-mono">CARD {i + 1}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => move(i, -1)} className="text-gray-500 hover:text-white"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button onClick={() => move(i, 1)} className="text-gray-500 hover:text-white"><ArrowDown className="h-3.5 w-3.5" /></button>
                          <button onClick={() => rmCard(i)} className="text-gray-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <Input value={c.image_url} onChange={(e) => setCardField(i, "image_url", e.target.value)}
                        placeholder="Card image URL (https://...)" className="bg-gray-900 border-gray-800 text-white font-mono text-xs mb-2" />
                      <textarea value={c.body_text} onChange={(e) => setCardField(i, "body_text", e.target.value)}
                        rows={3} placeholder="Card text..." className="w-full bg-gray-900 border border-gray-800 rounded-md text-white text-sm p-2" />
                    </div>
                  ))}
                  {cards.length === 0 && <p className="text-xs text-gray-600">No cards yet. Add the first one.</p>}
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-gray-800 pt-4">
                <button onClick={save} disabled={saving}
                  className="px-4 py-2 bg-yellow-500 text-black rounded font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
                <button onClick={togglePublish} disabled={saving}
                  className={`px-4 py-2 rounded font-semibold text-sm flex items-center gap-2 ${story.status === "published" ? "bg-gray-700 text-gray-200" : "bg-green-600 text-white"}`}>
                  {story.status === "published" ? <><EyeOff className="h-4 w-4" /> Unpublish</> : <><Eye className="h-4 w-4" /> Publish</>}
                </button>
                <button onClick={del} className="px-3 py-2 text-red-400 hover:bg-red-500/10 rounded text-sm flex items-center gap-1 ml-auto">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                {msg && <span className="text-xs text-green-400">{msg}</span>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-20 text-center text-gray-500 text-sm">
              Select a story on the left, or create a new one.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  )
}
