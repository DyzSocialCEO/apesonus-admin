"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Plus, Trash2, Loader2, Eye, EyeOff, RefreshCw } from "lucide-react"
import { ARTIST_ROSTER } from "@/lib/constants/artists"

const ARTISTS = Object.entries(ARTIST_ROSTER).map(([id, a]) => ({ id, name: a.name }))
const POST_TYPES = ["quote", "alpha", "take", "drop"]

export default function FeedPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [artistId, setArtistId] = useState(ARTISTS[0]?.id || "")
  const [content, setContent] = useState("")
  const [postType, setPostType] = useState("take")

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/feed")
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchPosts() }, [])

  const handleCreate = async () => {
    if (!content.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", artistId, content, postType }),
      })
      if (res.ok) {
        setContent("")
        setShowCreate(false)
        fetchPosts()
      }
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

  const artistName = (id: string) => ARTIST_ROSTER[id]?.name || id

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Culture Feed</h2>
          <p className="text-gray-400 text-sm">{posts.length} posts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPosts}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4 mr-2" /> New Post
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create Artist Post</CardTitle></CardHeader>
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No posts yet. Create one above.</CardContent></Card>
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
  )
}
