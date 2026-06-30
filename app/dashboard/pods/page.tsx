"use client"

import { useEffect, useState } from "react"
import { Radio, Loader2, Plus, Trash2, Save, Check, Eye, EyeOff, Pencil, X, Link2 } from "lucide-react"

type Episode = {
  id: number; title: string; blurb: string | null; audio: string; cover: string | null
  duration_seconds: number | null; is_published: boolean; published_at: string; created_at: string
}

const parseDuration = (t: string): number | null => {
  const s = t.trim()
  if (!s) return null
  if (s.includes(":")) { const [m, sec] = s.split(":"); const v = (Number(m) || 0) * 60 + (Number(sec) || 0); return v > 0 ? v : null }
  const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}
const fmtDuration = (sec: number | null): string => {
  if (!sec || sec <= 0) return "—"
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export default function PodsPage() {
  const [eps, setEps] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<number | null>(null)
  const [title, setTitle] = useState("")
  const [blurb, setBlurb] = useState("")
  const [audio, setAudio] = useState("")
  const [cover, setCover] = useState("")
  const [duration, setDuration] = useState("")
  const [published, setPublished] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState("")

  const load = () => {
    fetch("/api/admin/pods", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setEps(d.episodes || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const reset = () => { setEditing(null); setTitle(""); setBlurb(""); setAudio(""); setCover(""); setDuration(""); setPublished(true); setErr("") }
  const startEdit = (e: Episode) => {
    setEditing(e.id); setTitle(e.title); setBlurb(e.blurb || ""); setAudio(e.audio); setCover(e.cover || "")
    setDuration(e.duration_seconds ? fmtDuration(e.duration_seconds) : ""); setPublished(e.is_published); setErr("")
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const save = async () => {
    setSaving(true); setErr(""); setSaved(false)
    const payload = { title, blurb, audio, cover, duration_seconds: parseDuration(duration), is_published: published }
    try {
      const res = await fetch(editing ? `/api/admin/pods/${editing}` : "/api/admin/pods", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || "Could not save"); return }
      setSaved(true); setTimeout(() => setSaved(false), 1500); reset(); load()
    } catch { setErr("Could not save") } finally { setSaving(false) }
  }

  const togglePublish = async (e: Episode) => {
    await fetch(`/api/admin/pods/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_published: !e.is_published }) })
    load()
  }
  const del = async (e: Episode) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${e.title}"? This can't be undone.`)) return
    await fetch(`/api/admin/pods/${e.id}`, { method: "DELETE" }); load()
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Radio className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-white">Pods</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Free audio episodes — no Spins to listen. Upload the M4A to Bunny, then paste its CDN URL and the episode details here.
      </p>

      {/* Add / edit form */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          {editing ? <Pencil className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
          <h2 className="font-semibold text-white">{editing ? "Edit episode" : "New episode"}</h2>
          {editing && <button onClick={reset} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /> cancel</button>}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Read — Week of Jan 6"
              className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Blurb <span className="text-gray-700">(one-line hook)</span></label>
            <input value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="BTC ripped, alts bled, and someone fat-fingered a $2M buy."
              className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600 flex items-center gap-1"><Link2 className="w-3 h-3" /> Audio URL (M4A on Bunny)</label>
            <input value={audio} onChange={(e) => setAudio(e.target.value)} placeholder="https://apesonus.b-cdn.net/pods/episode.m4a"
              className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 font-mono text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-600">Cover URL <span className="text-gray-700">(optional)</span></label>
              <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…/cover.jpg"
                className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 font-mono text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-600">Duration <span className="text-gray-700">(MM:SS, optional)</span></label>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="12:34"
                className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setPublished(!published)} className="flex items-center gap-2 text-sm">
              {published ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-gray-500" />}
              <span className={published ? "text-white" : "text-gray-500"}>{published ? "Published — live in the feed" : "Draft — hidden from players"}</span>
            </button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-primary text-gray-950 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? "Saved" : editing ? "Save changes" : "Add episode"}
            </button>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
      </div>

      {/* Episode list */}
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-gray-500" />
        <h2 className="font-semibold text-white">Episodes <span className="text-gray-600 text-sm font-normal">({eps.length})</span></h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : eps.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center text-sm text-gray-600">No episodes yet. Add one above.</div>
      ) : (
        <div className="space-y-2.5">
          {eps.map((e) => (
            <div key={e.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white truncate">{e.title}</span>
                  {e.is_published
                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-primary border border-primary/30">LIVE</span>
                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-gray-500 border border-gray-700">DRAFT</span>}
                  <span className="text-[11px] text-gray-600">{fmtDuration(e.duration_seconds)}</span>
                </div>
                {e.blurb && <div className="text-xs text-gray-500 mt-0.5 truncate">{e.blurb}</div>}
                <div className="text-[11px] text-gray-700 font-mono mt-1 truncate">{e.audio}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => togglePublish(e)} title={e.is_published ? "Unpublish" : "Publish"}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
                  {e.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => startEdit(e)} title="Edit" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(e)} title="Delete" className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
