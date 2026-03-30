"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Trophy, Plus, Loader2, Play, Trash2, Radio, CheckCircle, XCircle, Crown, Zap,
} from "lucide-react"

const MOODS = ["moon", "rekt", "cope", "degen", "zen"]
const MOOD_EMOJI: Record<string, string> = { moon: "🚀", rekt: "💀", cope: "🧘", degen: "🔥", zen: "🌊" }
const STATUS_COLORS: Record<string, string> = { draft: "bg-gray-600", live: "bg-green-600", voting_closed: "bg-yellow-600", resolved: "bg-purple-600" }

const AUDIO_CDN = "https://apesonus-audio.b-cdn.net"

interface Artist { id: string; name: string }
interface Entry { id: number; round_id: number; artist_id: string; artist_name: string; audio_url: string; cover_url: string | null; vote_count: number; duration: number }
interface Round { id: number; title: string; mood: string; reward_pool: number; status: string; vote_deadline: string | null; winner_artist: string | null; total_votes: number; resolved_at: string | null; entries: Entry[]; created_at: string }

export default function IdolsPage() {
  const [rounds, setRounds] = useState<Round[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [dominantMood, setDominantMood] = useState("moon")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [mood, setMood] = useState("moon")
  const [pool, setPool] = useState("50000")
  const [deadline, setDeadline] = useState("")
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})

  const load = () => {
    fetch("/api/admin/idols").then(r => r.json()).then(d => {
      setRounds(d.rounds || [])
      setArtists(d.artists || [])
      setDominantMood(d.dominantMood || "moon")
      setMood(d.dominantMood || "moon")
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000) }

  const handleCreate = async () => {
    if (!title.trim()) return flash("Title required")
    const entries = artists.map(a => ({
      artistId: a.id,
      artistName: a.name,
      audioUrl: audioUrls[a.id] || "",
      coverUrl: null,
      duration: 0,
    }))
    const missing = entries.filter(e => !e.audioUrl)
    if (missing.length > 0) return flash(`Missing audio for: ${missing.map(e => e.artistName).join(", ")}`)

    setSaving(true)
    try {
      const res = await fetch("/api/admin/idols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", title, mood, rewardPool: parseInt(pool), voteDeadline: deadline || null, entries }),
      })
      const d = await res.json()
      if (d.success) { flash("Round created!"); setShowCreate(false); setTitle(""); setAudioUrls({}); load() }
      else flash(d.error || "Failed")
    } catch { flash("Error") }
    setSaving(false)
  }

  const handleAction = async (action: string, roundId: number) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/idols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, roundId }),
      })
      const d = await res.json()
      if (d.success) {
        if (action === "resolve") flash(`Resolved! Winner: ${d.winner} (${d.winnerVotes} votes). ${d.totalAwarded} $ONUS awarded to ${d.winnersCount} winners.`)
        else flash(`${action.replace("_", " ")} done!`)
        load()
      } else flash(d.error || "Failed")
    } catch { flash("Error") }
    setSaving(false)
  }

  const expandUrl = (u: string) => u.startsWith("http") ? u : `${AUDIO_CDN}${u.startsWith("/") ? "" : "/"}${u}`

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Trophy className="w-6 h-6 text-yellow-400" /> APE IDOLS</h1>
          <p className="text-gray-400">Weekly artist competition. Same song, 7 versions, community votes.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm">
            <span className="text-gray-400">Pulse: </span>
            <span className="font-bold text-white">{MOOD_EMOJI[dominantMood]} {dominantMood.toUpperCase()}</span>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} className="gap-2">
            <Plus className="w-4 h-4" /> New Round
          </Button>
        </div>
      </div>

      {msg && <div className="px-4 py-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium">{msg}</div>}

      {/* CREATE FORM */}
      {showCreate && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader><CardTitle className="text-lg text-white">Create New Round</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Song Title</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diamond Hands" className="bg-gray-800 border-gray-700" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Mood (from Pulse)</label>
                <select value={mood} onChange={e => setMood(e.target.value)} className="w-full h-10 rounded-md bg-gray-800 border border-gray-700 text-white px-3">
                  {MOODS.map(m => <option key={m} value={m}>{MOOD_EMOJI[m]} {m.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Reward Pool ($ONUS)</label>
                <Input type="number" value={pool} onChange={e => setPool(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Vote Deadline (optional)</label>
                <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Audio URLs (one per artist — CDN path or full URL)</label>
              <div className="space-y-2">
                {artists.map(a => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="text-sm text-white w-40 shrink-0">{a.name}</span>
                    <Input
                      value={audioUrls[a.id] || ""}
                      onChange={e => setAudioUrls(prev => ({ ...prev, [a.id]: e.target.value }))}
                      placeholder={`/idols/round-1/${a.id}.m4a`}
                      className="bg-gray-800 border-gray-700 flex-1"
                    />
                    {audioUrls[a.id] && (
                      <button onClick={() => { const au = new Audio(expandUrl(audioUrls[a.id])); au.play() }} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700">
                        <Play className="w-4 h-4 text-green-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Create Round
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ROUNDS LIST */}
      <div className="space-y-4">
        {rounds.length === 0 && <p className="text-gray-500 text-center py-10">No idol rounds yet. Create one above.</p>}
        {rounds.map(r => (
          <Card key={r.id} className="bg-gray-900 border-gray-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-white">{r.title}</h3>
                    <Badge className={`${STATUS_COLORS[r.status]} text-white text-xs`}>{r.status.replace("_", " ")}</Badge>
                    <span className="text-lg">{MOOD_EMOJI[r.mood]}</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Pool: <span className="text-yellow-400 font-bold">{r.reward_pool.toLocaleString()} $ONUS</span>
                    {" · "}{r.total_votes} votes
                    {r.vote_deadline && ` · Deadline: ${new Date(r.vote_deadline).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.status === "draft" && (
                    <Button size="sm" onClick={() => handleAction("go_live", r.id)} disabled={saving} className="gap-1 bg-green-600 hover:bg-green-700">
                      <Radio className="w-3 h-3" /> Go Live
                    </Button>
                  )}
                  {r.status === "live" && (
                    <Button size="sm" onClick={() => handleAction("close_voting", r.id)} disabled={saving} className="gap-1 bg-yellow-600 hover:bg-yellow-700">
                      <XCircle className="w-3 h-3" /> Close Voting
                    </Button>
                  )}
                  {r.status === "voting_closed" && (
                    <Button size="sm" onClick={() => handleAction("resolve", r.id)} disabled={saving} className="gap-1 bg-purple-600 hover:bg-purple-700">
                      <Crown className="w-3 h-3" /> Resolve
                    </Button>
                  )}
                  {(r.status === "draft" || r.status === "resolved") && (
                    <Button size="sm" variant="destructive" onClick={() => handleAction("delete", r.id)} disabled={saving} className="gap-1">
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  )}
                </div>
              </div>

              {/* Entries */}
              <div className="space-y-2">
                {r.entries.map(e => {
                  const isWinner = r.winner_artist === e.artist_id
                  return (
                    <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isWinner ? "bg-yellow-400/10 border border-yellow-400/30" : "bg-gray-800/50"}`}>
                      {isWinner && <Crown className="w-4 h-4 text-yellow-400 shrink-0" />}
                      <span className="text-sm font-medium text-white w-36 shrink-0">{e.artist_name}</span>
                      <span className="text-xs text-gray-500 flex-1 truncate">{e.audio_url}</span>
                      <span className="text-sm font-bold text-gray-300">{e.vote_count} votes</span>
                      {e.audio_url && (
                        <button onClick={() => { const au = new Audio(expandUrl(e.audio_url)); au.play() }} className="p-1.5 rounded bg-gray-700 hover:bg-gray-600">
                          <Play className="w-3 h-3 text-green-400" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {r.status === "resolved" && r.winner_artist && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-purple-400/10 border border-purple-400/20">
                  <p className="text-sm text-purple-300">
                    <Crown className="w-3 h-3 inline mr-1" />
                    Winner: <span className="font-bold text-white">{r.entries.find(e => e.artist_id === r.winner_artist)?.artist_name}</span>
                    {" · "}Track added to catalog
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
