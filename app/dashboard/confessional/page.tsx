"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  MessageCircle, Plus, Trash2, Loader2, ChevronDown, ChevronUp, Bot, Send,
} from "lucide-react"

interface Post {
  id: number
  mood: string
  content: string
  is_dr_rektstein: boolean
  reactions_count: number
  comments_count: number
  created_at: string
}

interface Comment {
  id: number
  content: string
  is_dr_rektstein: boolean
  created_at: string
}

const MOODS = [
  { id: "moon", emoji: "🚀", label: "MOON", color: "#22c55e" },
  { id: "rekt", emoji: "💀", label: "REKT", color: "#ef4444" },
  { id: "cope", emoji: "😐", label: "COPE", color: "#f97316" },
  { id: "degen", emoji: "🐒", label: "DEGEN", color: "#a855f7" },
  { id: "zen", emoji: "🧘", label: "ZEN", color: "#06b6d4" },
]

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ConfessionalPage() {
  // Post creator state
  const [mood, setMood] = useState("cope")
  const [content, setContent] = useState("")
  const [asDr, setAsDr] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postMsg, setPostMsg] = useState("")

  // Comment creator state
  const [commentContent, setCommentContent] = useState("")
  const [commentAsDr, setCommentAsDr] = useState(false)
  const [commentingOn, setCommentingOn] = useState<number | null>(null)
  const [sendingComment, setSendingComment] = useState(false)

  // Feed state
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPost, setExpandedPost] = useState<number | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: number } | null>(null)

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/confessional")
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Fetch comments for a post
  const fetchComments = async (postId: number) => {
    setLoadingComments(true)
    try {
      const res = await fetch(`/api/admin/confessional?action=comments&postId=${postId}`)
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
      }
    } catch {} finally {
      setLoadingComments(false)
    }
  }

  // Toggle expand post
  const toggleExpand = (postId: number) => {
    if (expandedPost === postId) {
      setExpandedPost(null)
      setComments([])
      setCommentingOn(null)
    } else {
      setExpandedPost(postId)
      fetchComments(postId)
      setCommentingOn(postId)
    }
  }

  // Create post
  const handleCreatePost = async () => {
    if (!content.trim()) return
    setPosting(true)
    setPostMsg("")

    try {
      const res = await fetch("/api/admin/confessional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_post", mood, content: content.trim(), asDrRektstein: asDr }),
      })

      if (res.ok) {
        setContent("")
        setPostMsg("✅ Posted!")
        fetchPosts()
        setTimeout(() => setPostMsg(""), 3000)
      } else {
        const err = await res.json()
        setPostMsg(`❌ ${err.error}`)
      }
    } catch {
      setPostMsg("❌ Network error")
    } finally {
      setPosting(false)
    }
  }

  // Create comment
  const handleCreateComment = async (postId: number) => {
    if (!commentContent.trim()) return
    setSendingComment(true)

    try {
      const res = await fetch("/api/admin/confessional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_comment", postId, content: commentContent.trim(), asDrRektstein: commentAsDr }),
      })

      if (res.ok) {
        setCommentContent("")
        fetchComments(postId)
        fetchPosts() // refresh comment count
      }
    } catch {} finally {
      setSendingComment(false)
    }
  }

  // Delete
  const handleDelete = async (type: string, id: number) => {
    try {
      await fetch("/api/admin/confessional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type === "post" ? "delete_post" : "delete_comment", postId: type === "post" ? id : undefined, commentId: type === "comment" ? id : undefined }),
      })
      setDeleteConfirm(null)
      if (type === "post") {
        fetchPosts()
        if (expandedPost === id) { setExpandedPost(null); setComments([]) }
      } else if (expandedPost) {
        fetchComments(expandedPost)
        fetchPosts()
      }
    } catch {}
  }

  const getMood = (id: string) => MOODS.find(m => m.id === id) || MOODS[2]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <MessageCircle className="w-7 h-7 text-yellow-400" />
          Confessional Manager
        </h1>
        <p className="text-gray-500 mt-1">Create posts, add comments, manage the feed.</p>
      </div>

      {/* ── POST CREATOR ── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Confession
          </h2>

          {/* Mood selector */}
          <div className="flex gap-2">
            {MOODS.map(m => (
              <button
                key={m.id}
                onClick={() => setMood(m.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: mood === m.id ? `${m.color}20` : "transparent",
                  border: `1px solid ${mood === m.id ? m.color : "#374151"}`,
                  color: mood === m.id ? m.color : "#9ca3af",
                }}
              >
                <span>{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste or type the confession here... No character limit for seed posts."
            rows={10}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-gray-500 resize-y font-mono"
          />

          {/* Options */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={asDr}
                onChange={e => setAsDr(e.target.checked)}
                className="rounded"
              />
              <Bot className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-400">Post as DR REKTSTEIN</span>
            </label>

            <div className="flex items-center gap-3">
              {postMsg && <span className="text-sm">{postMsg}</span>}
              <Button
                onClick={handleCreatePost}
                disabled={!content.trim() || posting}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
              >
                {posting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Post
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── FEED MANAGER ── */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Feed ({posts.length} posts)
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No posts yet. Create one above.</p>
        ) : (
          posts.map(post => {
            const m = getMood(post.mood)
            const isExpanded = expandedPost === post.id
            const preview = post.content.length > 150 ? post.content.slice(0, 150) + "..." : post.content

            return (
              <Card key={post.id} className="bg-gray-900 border-gray-800 overflow-hidden">
                {/* Post header + preview */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleExpand(post.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold"
                          style={{ background: `${m.color}20`, color: m.color }}
                        >
                          {m.emoji} {m.label}
                        </span>
                        {post.is_dr_rektstein && (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400">
                            DR REKTSTEIN
                          </span>
                        )}
                        <span className="text-xs text-gray-600">{timeAgo(post.created_at)}</span>
                        <span className="text-xs text-gray-600">
                          🫡{post.reactions_count} 💬{post.comments_count}
                        </span>
                      </div>

                      {/* Content preview */}
                      <p className="text-sm text-gray-300 whitespace-pre-line">
                        {isExpanded ? post.content : preview}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded: comments + actions */}
                {isExpanded && (
                  <div className="border-t border-gray-800">
                    {/* Comments */}
                    <div className="p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-400">
                        Comments ({comments.length})
                      </h3>

                      {loadingComments ? (
                        <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                      ) : comments.length === 0 ? (
                        <p className="text-xs text-gray-600">No comments yet</p>
                      ) : (
                        comments.map(c => (
                          <div key={c.id} className="flex items-start gap-2 group">
                            {c.is_dr_rektstein && <Bot className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold" style={{ color: c.is_dr_rektstein ? "#facc15" : "#6b7280" }}>
                                  {c.is_dr_rektstein ? "DR REKTSTEIN" : "Anonymous"}
                                </span>
                                <span className="text-[10px] text-gray-700">{timeAgo(c.created_at)}</span>
                              </div>
                              <p className="text-xs text-gray-400 whitespace-pre-line">{c.content}</p>
                            </div>
                            <button
                              onClick={() => setDeleteConfirm({ type: "comment", id: c.id })}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        ))
                      )}

                      {/* Add comment */}
                      <div className="pt-2 border-t border-gray-800 space-y-2">
                        <textarea
                          value={commentContent}
                          onChange={e => setCommentContent(e.target.value)}
                          placeholder="Add a comment to this post..."
                          rows={3}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 outline-none focus:border-gray-500 resize-y"
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={commentAsDr}
                              onChange={e => setCommentAsDr(e.target.checked)}
                              className="rounded"
                            />
                            <Bot className="w-3 h-3 text-yellow-400" />
                            <span className="text-xs text-gray-500">As DR REKTSTEIN</span>
                          </label>
                          <Button
                            size="sm"
                            onClick={() => handleCreateComment(post.id)}
                            disabled={!commentContent.trim() || sendingComment}
                            className="bg-gray-700 hover:bg-gray-600 text-white text-xs"
                          >
                            {sendingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Comment"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Delete post */}
                    <div className="px-4 pb-3">
                      {deleteConfirm?.type === "post" && deleteConfirm.id === post.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete this post and all its comments?</span>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete("post", post.id)} className="text-xs">
                            Yes, delete
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="text-xs">
                            Cancel
                          </Button>
                        </div>
                      ) : deleteConfirm?.type === "comment" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete this comment?</span>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete("comment", deleteConfirm.id)} className="text-xs">
                            Yes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="text-xs">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm({ type: "post", id: post.id })}
                          className="flex items-center gap-1.5 text-xs text-red-500/50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete post
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
