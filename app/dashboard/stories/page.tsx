"use client"

import { useState, useEffect } from "react"

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
  selected: "bg-[#ffc847]/20 text-[#ffc847]",
}

const MOOD_EMOJI: Record<string, string> = {
  moon: "🚀",
  rekt: "💀",
  cope: "🧠",
  degen: "🎰",
  zen: "🧘",
}

export default function StoriesPage() {
  const [stories, setStories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("pending")
  const [stats, setStats] = useState({ pending: 0, approved: 0, selected: 0, rejected: 0, total: 0 })

  const fetchStories = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stories?status=all`)
      const data = await res.json()
      const all = data.stories || []

      setStats({
        pending: all.filter((s: any) => s.status === "pending").length,
        approved: all.filter((s: any) => s.status === "approved").length,
        selected: all.filter((s: any) => s.status === "selected").length,
        rejected: all.filter((s: any) => s.status === "rejected").length,
        total: all.length,
      })

      if (filter === "all") {
        setStories(all)
      } else {
        setStories(all.filter((s: any) => s.status === filter))
      }
    } catch {
      setStories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStories() }, [filter])

  const updateStatus = async (id: number, status: string) => {
    const confirmed = status === "selected"
      ? confirm("Select this story for a track? This awards 500 Moji Points to the author.")
      : status === "rejected"
      ? confirm("Reject this story?")
      : true

    if (!confirmed) return

    try {
      const res = await fetch("/api/admin/stories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) fetchStories()
    } catch {}
  }

  const deleteStory = async (id: number) => {
    if (!confirm("Delete this story permanently?")) return
    try {
      await fetch(`/api/admin/stories?id=${id}`, { method: "DELETE" })
      fetchStories()
    } catch {}
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">📖 Crypto Stories</h1>
        <p className="text-sm text-white/50 mt-1">Review user submissions, approve or select for tracks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-white" },
          { label: "Pending", value: stats.pending, color: "text-yellow-400" },
          { label: "Approved", value: stats.approved, color: "text-green-400" },
          { label: "Selected", value: stats.selected, color: "text-[#ffc847]" },
          { label: "Rejected", value: stats.rejected, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-white/40">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["pending", "approved", "selected", "rejected", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
              filter === f ? "bg-[#ffc847] text-black" : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {f} {f !== "all" && filter !== f && `(${f === "pending" ? stats.pending : f === "approved" ? stats.approved : f === "selected" ? stats.selected : stats.rejected})`}
          </button>
        ))}
      </div>

      {/* Stories list */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-[#ffc847]/30 border-t-[#ffc847] rounded-full animate-spin mx-auto" />
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          No {filter === "all" ? "" : filter} stories found
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((story) => (
            <div key={story.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">{MOOD_EMOJI[story.mood] || "🎵"}</span>
                <span className="text-sm font-bold text-white/70 uppercase">{story.mood}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[story.status]}`}>
                  {story.status}
                </span>
                <span className="text-xs text-white/30 ml-auto">
                  ID: {story.telegram_id}
                </span>
              </div>

              {/* User info */}
              {story.user && (
                <p className="text-xs text-white/30 mb-2">
                  By: {story.user.first_name || ""} {story.user.last_name || ""} {story.user.username ? `(@${story.user.username})` : ""}
                </p>
              )}

              {/* Content */}
              <p className="text-white/80 text-sm leading-relaxed mb-3">{story.content}</p>

              {/* Meta */}
              <div className="flex items-center gap-4 text-xs text-white/30 mb-3">
                <span>❤️ {story.resonates_count || 0} resonates</span>
                {story.moji_earned > 0 && <span className="text-[#ffc847]">🪙 {story.moji_earned} Moji awarded</span>}
                <span>{new Date(story.created_at).toLocaleString()}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {story.status === "pending" && (
                  <>
                    <button
                      onClick={() => updateStatus(story.id, "approved")}
                      className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-bold hover:bg-green-500/30"
                    >
                      ✅ Approve
                    </button>
                    <button
                      onClick={() => updateStatus(story.id, "rejected")}
                      className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30"
                    >
                      ❌ Reject
                    </button>
                  </>
                )}
                {(story.status === "pending" || story.status === "approved") && (
                  <button
                    onClick={() => updateStatus(story.id, "selected")}
                    className="px-4 py-2 rounded-lg bg-[#ffc847]/20 text-[#ffc847] text-xs font-bold hover:bg-[#ffc847]/30"
                  >
                    ⭐ Select for Track (+500 Moji)
                  </button>
                )}
                <button
                  onClick={() => deleteStory(story.id)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-white/30 text-xs font-bold hover:bg-white/10 ml-auto"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
