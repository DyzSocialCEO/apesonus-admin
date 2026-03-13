"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Plus, Trash2, Loader2, Eye, EyeOff, RefreshCw, Sparkles, Check, X, ChevronDown, ChevronUp, Pencil } from "lucide-react"
import { ARTIST_ROSTER } from "@/lib/constants/artists"

const ARTISTS = Object.entries(ARTIST_ROSTER)
  .filter(([_, a]) => typeof a === "object" && "name" in a)
  .map(([id, a]: [string, any]) => ({ id, name: a.name }))
const POST_TYPES = ["take", "alpha", "quote", "drop"]

interface Draft {
  artistId: string
  content: string
  postType: string
  category: string
  candidates?: string[]
}

interface ContextData {
  market: string
  moodPulse: string
  chart: string
  dayOfWeek: string
}

export default function FeedPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Manual create
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [artistId, setArtistId] = useState(ARTISTS[0]?.id || "")
  const [content, setContent] = useState("")
  const [postType, setPostType] = useState("take")

  // AI generation
  const [generating, setGenerating] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [contextData, setContextData] = useState<ContextData | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [artistCount, setArtistCount] = useState(4)
  const [publishingIdx, setPublishingIdx] = useState<number | null>(null)
  const [genErrors, setGenErrors] = useState<string[]>([])

  // Edit state per draft
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState("")

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/feed")
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchPosts() }, [])

  // ── Manual create ──
  const handleCreate = async () => {
    if (!content.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", artistId, content, postType }),
      })
      if (res.ok) { setContent(""); setShowCreate(false); fetchPosts() }
    } catch {} finally { setCreating(false) }
  }

  const handleDelete = async (postId: number) => {
    if (!confirm("Delete this post?")) return
    await fetch("/api/admin/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", postId }),
    })
    fetchPosts()
  }

  const handleToggle = async (postId: number, published: boolean) => {
    await fetch("/api/admin/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", postId, published }),
    })
    fetchPosts()
  }

  // ── AI generation ──
  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setDrafts([])
    setContextData(null)
    try {
      const res = await fetch("/api/admin/generate-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistCount }),
      })
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      setDrafts(data.drafts || [])
      setContextData(data.context || null)
      setGenErrors(data.errors || [])
    } catch (e: any) {
      alert("Generation failed: " + (e.message || "unknown error"))
    } finally {
      setGenerating(false)
    }
  }

  // Publish a single draft
  const handlePublishDraft = async (idx: number) => {
    const draft = drafts[idx]
    if (!draft) return
    setPublishingIdx(idx)
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          artistId: draft.artistId,
          content: draft.content,
          postType: draft.postType,
        }),
      })
      if (res.ok) {
        setDrafts(prev => prev.filter((_, i) => i !== idx))
        fetchPosts()
      }
    } catch {} finally {
      setPublishingIdx(null)
    }
  }

  // Publish all remaining drafts
  const handlePublishAll = async () => {
    for (let i = 0; i < drafts.length; i++) {
      await handlePublishDraft(0) // always 0 because array shrinks
    }
  }

  // Swap to a different candidate
  const handleSwapCandidate = (draftIdx: number, candidateIdx: number) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== draftIdx || !d.candidates) return d
      return { ...d, content: d.candidates[candidateIdx] }
    }))
  }

  // Edit a draft
  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditText(drafts[idx].content)
  }

  const saveEdit = (idx: number) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, content: editText } : d))
    setEditingIdx(null)
    setEditText("")
  }

  // Discard a draft
  const discardDraft = (idx: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== idx))
  }

  const artistName = (id: string) => {
    const entry = ARTIST_ROSTER[id]
    return (entry && typeof entry === "object" && "name" in entry) ? (entry as any).name : id
  }

  const categoryLabel = (cat: string) => cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Culture Feed</h2>
          <p className="text-gray-400 text-sm">{posts.length} posts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPosts}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4 mr-2" /> Manual
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating}
            className="bg-purple-600 hover:bg-purple-700">
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
              : <><Sparkles className="w-4 h-4 mr-2" /> Generate AI Posts</>
            }
          </Button>
        </div>
      </div>

      {/* AI Generation Controls */}
      <Card className="border-purple-500/30 bg-purple-950/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Artists today</label>
              <select value={artistCount} onChange={e => setArtistCount(Number(e.target.value))}
                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700">
                {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} artists</option>)}
              </select>
            </div>
            <div className="flex-1 text-xs text-gray-500">
              Picks {artistCount} artists who haven't posted recently. Generates 1 post each with different categories.
              Review and approve below.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context Data */}
      {contextData && (
        <Card>
          <CardContent className="py-3">
            <button onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-2 text-sm text-gray-400 w-full text-left">
              {showContext ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Real context used for generation
            </button>
            {showContext && (
              <div className="mt-3 space-y-1.5 text-xs text-gray-500 font-mono">
                <p>📈 {contextData.market}</p>
                <p>🌍 {contextData.moodPulse}</p>
                <p>📊 {contextData.chart}</p>
                <p>📅 {contextData.dayOfWeek}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generation Errors */}
      {genErrors.length > 0 && (
        <Card className="border-red-500/30 bg-red-950/20">
          <CardContent className="py-3">
            <p className="text-sm font-bold text-red-400 mb-1">⚠️ Some generations failed:</p>
            {genErrors.map((e, i) => <p key={i} className="text-xs text-red-300/70">{e}</p>)}
          </CardContent>
        </Card>
      )}

      {/* AI Drafts Review */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">📝 AI Drafts — Review & Approve</h3>
            <Button size="sm" onClick={handlePublishAll} variant="outline" className="text-green-400 border-green-500/30">
              <Check className="w-4 h-4 mr-2" /> Publish All
            </Button>
          </div>

          {drafts.map((draft, idx) => (
            <Card key={idx} className="border-purple-500/20">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Artist + category */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-white">{artistName(draft.artistId)}</span>
                      <Badge className="text-[10px] bg-purple-500/20 text-purple-300">{draft.postType}</Badge>
                      <span className="text-[10px] text-gray-500">{categoryLabel(draft.category)}</span>
                    </div>

                    {/* Content / edit */}
                    {editingIdx === idx ? (
                      <div className="space-y-2">
                        <textarea value={editText} onChange={e => setEditText(e.target.value)}
                          rows={3} maxLength={500}
                          className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-purple-500/40 resize-none" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(idx)} className="bg-green-600 hover:bg-green-700">Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingIdx(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{draft.content}</p>
                    )}

                    {/* Candidate alternatives */}
                    {draft.candidates && draft.candidates.length > 1 && editingIdx !== idx && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Alternatives:</p>
                        {draft.candidates.map((c, ci) => (
                          <button key={ci} onClick={() => handleSwapCandidate(idx, ci)}
                            className={`block w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                              c === draft.content
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                            }`}>
                            {c.length > 120 ? c.slice(0, 120) + "..." : c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => handlePublishDraft(idx)} disabled={publishingIdx === idx}
                      className="p-2 rounded-lg hover:bg-green-900/30 text-green-400 transition-colors"
                      title="Publish">
                      {publishingIdx === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => startEdit(idx)}
                      className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
                      title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => discardDraft(idx)}
                      className="p-2 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                      title="Discard">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manual Create Form */}
      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">Manual Post</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Artist</label>
                <select value={artistId} onChange={e => setArtistId(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                  {ARTISTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Type</label>
                <select value={postType} onChange={e => setPostType(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                  {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Content</label>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                rows={4} maxLength={500} placeholder="Write in the artist's voice..."
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 resize-none" />
              <p className="text-xs text-gray-500 mt-1">{content.length}/500</p>
            </div>
            <Button onClick={handleCreate} disabled={!content.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Publish Post
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Published Posts */}
      <div>
        <h3 className="text-lg font-bold text-white mb-3">Published Posts</h3>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-gray-500">No posts yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {posts.map((post: any) => (
              <Card key={post.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-white">{artistName(post.artist_id)}</span>
                        <Badge variant={post.is_published ? "default" : "secondary"} className="text-[10px]">
                          {post.post_type}
                        </Badge>
                        {!post.is_published && <Badge variant="destructive" className="text-[10px]">Hidden</Badge>}
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{post.content}</p>
                      <p className="text-xs text-gray-600 mt-2">{new Date(post.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleToggle(post.id, !post.is_published)}
                        className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                        {post.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(post.id)}
                        className="p-2 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
