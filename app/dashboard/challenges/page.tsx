"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Minus, Trash2, Loader2, RefreshCw, Trophy, Users, Clock, Eye, CheckCircle, XCircle, Star, Swords, Volume2, Play, Pause } from "lucide-react"

// Signed audio preview — fetches signed URL from admin API
function SignedAudioPreview({ url }: { url: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState(false)

  const sign = useCallback(async () => {
    if (!url.trim()) return
    try {
      const res = await fetch("/api/admin/sign-audio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (res.ok) { const d = await res.json(); setSignedUrl(d.signedUrl); setError(false) }
      else setError(true)
    } catch { setError(true) }
  }, [url])

  useEffect(() => { sign() }, [sign])
  useEffect(() => { return () => { if (audioEl) { audioEl.pause() } } }, [audioEl])

  const toggle = () => {
    if (!signedUrl) return
    if (playing && audioEl) { audioEl.pause(); setPlaying(false); return }
    const a = new Audio(signedUrl)
    a.addEventListener("ended", () => setPlaying(false))
    a.addEventListener("error", () => { setPlaying(false); setError(true) })
    a.play().then(() => { setPlaying(true); setAudioEl(a) }).catch(() => setError(true))
  }

  if (error) return <span className="text-[10px] text-red-400">Failed to load</span>
  if (!signedUrl) return <span className="text-[10px] text-gray-500">Signing...</span>

  return (
    <button onClick={toggle} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-colors">
      {playing ? <Pause className="w-3 h-3 text-purple-400" /> : <Play className="w-3 h-3 text-purple-400" />}
      <span className="text-[10px] text-purple-400 font-semibold">{playing ? "Stop" : "Preview"}</span>
    </button>
  )
}

const CHALLENGE_TYPES = [
  { id: "name_the_artist", label: "🎤 Name the Artist", description: "Play vocal snippet — user picks the artist", defaultReward: 50 },
  { id: "name_the_artist_instrumental", label: "🎹 Instrumental", description: "Play instrumental only — user guesses artist (harder, 2× reward)", defaultReward: 100 },
  { id: "finish_the_lyric", label: "✍️ Finish the Lyric", description: "Audio stops mid-line — user picks what comes next", defaultReward: 50 },
  { id: "identify_the_mood", label: "🌍 What Mood Is This?", description: "Play snippet — user picks the mood world", defaultReward: 30 },
  { id: "which_track", label: "🎵 Which Track?", description: "Play snippet — user picks the track name", defaultReward: 50 },
  { id: "odd_one_out", label: "👂 Odd One Out", description: "3 snippets — two same artist, one different. Pick the odd one.", defaultReward: 150 },
]

const MOODS = ["MOON", "REKT", "COPE", "DEGEN", "ZEN"]

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  scheduled: "bg-blue-500/20 text-blue-400",
  live: "bg-green-500/20 text-green-400",
  completed: "bg-purple-500/20 text-purple-400",
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [viewSubs, setViewSubs] = useState<number | null>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [completing, setCompleting] = useState<number | null>(null)

  // Form state
  const [type, setType] = useState("name_the_artist")
  const [lyricSnippet, setLyricSnippet] = useState("")
  const [audioUrl, setAudioUrl] = useState("")
  const [audioUrl2, setAudioUrl2] = useState("")
  const [audioUrl3, setAudioUrl3] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [wrongOptions, setWrongOptions] = useState(["", "", ""])
  const [onusReward, setOnusReward] = useState(50)
  const [starsEligible, setStarsEligible] = useState(false)
  const [starsWinnerCount, setStarsWinnerCount] = useState(5)
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")

  const currentType = CHALLENGE_TYPES.find(t => t.id === type)!
  const isOddOneOut = type === "odd_one_out"
  const isMoodType = type === "identify_the_mood"

  const fetchChallenges = async () => {
    setLoading(true)
    try { const res = await fetch("/api/admin/challenges"); const data = await res.json(); setChallenges(data.challenges || []) }
    catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchChallenges() }, [])

  const resetForm = () => {
    setLyricSnippet(""); setAudioUrl(""); setAudioUrl2(""); setAudioUrl3("")
    setCorrectAnswer(""); setWrongOptions(["", "", ""])
    setOnusReward(currentType?.defaultReward || 50)
    setStarsEligible(false); setStarsWinnerCount(5); setStartsAt(""); setEndsAt("")
  }

  const handleTypeChange = (newType: string) => {
    setType(newType)
    setCorrectAnswer(""); setWrongOptions(["", "", ""])
    setAudioUrl2(""); setAudioUrl3("")
    const t = CHALLENGE_TYPES.find(ct => ct.id === newType)
    if (t) setOnusReward(t.defaultReward)
  }

  const handleCreate = async () => {
    if (!lyricSnippet.trim() || !correctAnswer.trim() || !startsAt || !endsAt || creating) return
    if (!audioUrl.trim()) { alert("Audio snippet URL is required for all challenge types"); return }

    const allOptions = isMoodType
      ? MOODS
      : isOddOneOut
        ? ["Snippet A", "Snippet B", "Snippet C"]
        : [correctAnswer, ...wrongOptions.filter(o => o.trim())].sort(() => Math.random() - 0.5)

    if (!isMoodType && !isOddOneOut && allOptions.length < 2) { alert("Need at least 2 options"); return }
    if (!allOptions.includes(correctAnswer)) { alert("Correct answer must be in options"); return }

    if (isOddOneOut && (!audioUrl2.trim() || !audioUrl3.trim())) {
      alert("Odd One Out requires all 3 audio snippet URLs"); return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/admin/challenges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", type, lyricSnippet,
          audioUrl: audioUrl.trim() || null,
          audioUrl2: audioUrl2.trim() || null,
          audioUrl3: audioUrl3.trim() || null,
          correctAnswer, options: allOptions, onusReward,
          starsEligible, starsWinnerCount: starsEligible ? starsWinnerCount : 0,
          startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) { resetForm(); setShowCreate(false); fetchChallenges() }
      else alert(data.error || "Failed to create")
    } catch (e: any) { alert(e.message) } finally { setCreating(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this challenge and all submissions?")) return
    await fetch("/api/admin/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
    fetchChallenges()
  }

  const handleComplete = async (id: number) => {
    if (!confirm("Complete this challenge? This will reveal the answer and distribute rewards.")) return
    setCompleting(id)
    try {
      const res = await fetch("/api/admin/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", id }) })
      const data = await res.json()
      if (data.success) { alert(`Completed! ${data.correctSubmissions} correct, ${data.onusAwarded} ONUS distributed`); fetchChallenges() }
      else alert(data.error)
    } catch {} finally { setCompleting(null) }
  }

  const viewSubmissions = async (id: number) => {
    setViewSubs(id); setLoadingSubs(true)
    try {
      const res = await fetch("/api/admin/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submissions", id }) })
      const data = await res.json(); setSubmissions(data.submissions || [])
    } catch {} finally { setLoadingSubs(false) }
  }

  const typeLabel = (t: string) => CHALLENGE_TYPES.find(ct => ct.id === t)?.label || t

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Swords className="w-6 h-6 text-purple-400" /> Challenge Arena</h2>
          <p className="text-gray-400 text-sm">{challenges.length} challenges · 6 game types</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchChallenges}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-purple-600 hover:bg-purple-700"><Plus className="w-4 h-4 mr-2" /> New Challenge</Button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-purple-500/30">
          <CardHeader><CardTitle className="text-base">Create Challenge</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Challenge Type</label>
              <select value={type} onChange={e => handleTypeChange(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                {CHALLENGE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
              </select>
            </div>

            {/* Question text */}
            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                {type === "finish_the_lyric" ? "Lyric context (what plays before the blank)" :
                 isOddOneOut ? "Question text (e.g. 'Which snippet is from a different artist?')" :
                 "Question / Lyric excerpt"}
              </label>
              <textarea value={lyricSnippet} onChange={e => setLyricSnippet(e.target.value)} rows={3}
                placeholder={
                  type === "name_the_artist" ? "🎧 Listen to the snippet — who is this artist?" :
                  type === "name_the_artist_instrumental" ? "🎹 Instrumental only — can you name the artist?" :
                  type === "finish_the_lyric" ? "The audio stops mid-line. What comes next?" :
                  type === "identify_the_mood" ? "🌍 Listen — which mood world does this track belong to?" :
                  type === "which_track" ? "🎵 Name that track!" :
                  "👂 Two snippets are from the same artist. Which one is different?"
                }
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 resize-none font-mono" />
            </div>

            {/* Audio snippet(s) */}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                  {isOddOneOut ? "Snippet A URL" : "Audio Snippet URL"} (15sec clip)
                </label>
                <div className="flex items-center gap-2">
                  <Input className="flex-1" value={audioUrl} onChange={e => setAudioUrl(e.target.value)}
                    placeholder="https://apesonus-audio.b-cdn.net/snippets/clip.m4a" />
                  {audioUrl.trim() && <SignedAudioPreview url={audioUrl.trim()} />}
                </div>
              </div>
              {isOddOneOut && (
                <>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-violet-400" /> Snippet B URL
                    </label>
                    <div className="flex items-center gap-2">
                      <Input className="flex-1" value={audioUrl2} onChange={e => setAudioUrl2(e.target.value)}
                        placeholder="https://apesonus-audio.b-cdn.net/snippets/clip-b.m4a" />
                      {audioUrl2.trim() && <SignedAudioPreview url={audioUrl2.trim()} />}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-blue-400" /> Snippet C URL
                    </label>
                    <div className="flex items-center gap-2">
                      <Input className="flex-1" value={audioUrl3} onChange={e => setAudioUrl3(e.target.value)}
                        placeholder="https://apesonus-audio.b-cdn.net/snippets/clip-c.m4a" />
                      {audioUrl3.trim() && <SignedAudioPreview url={audioUrl3.trim()} />}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Correct Answer */}
            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                {type === "name_the_artist" || type === "name_the_artist_instrumental" ? "Correct Artist" :
                 isMoodType ? "Correct Mood" :
                 type === "which_track" ? "Correct Track Name" :
                 isOddOneOut ? "Correct Answer (Snippet A, Snippet B, or Snippet C)" :
                 "Correct Answer (the missing lyric)"}
              </label>
              {isMoodType ? (
                <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                  <option value="">Select mood...</option>
                  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : isOddOneOut ? (
                <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                  <option value="">Select the odd snippet...</option>
                  <option value="Snippet A">Snippet A</option>
                  <option value="Snippet B">Snippet B</option>
                  <option value="Snippet C">Snippet C</option>
                </select>
              ) : (
                <Input value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
                  placeholder={type === "which_track" ? "e.g. Four AM Panic" : type.includes("artist") ? "e.g. Down Bad Dave" : "e.g. wide awake"} />
              )}
            </div>

            {/* Wrong Options (not for mood or odd one out) */}
            {!isMoodType && !isOddOneOut && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-400">Wrong Options (at least 2)</label>
                  <button type="button" onClick={() => setWrongOptions([...wrongOptions, ""])}
                    className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded-lg hover:bg-purple-500/10 transition-colors">
                    <Plus className="w-3 h-3" /> Add option
                  </button>
                </div>
                <div className="space-y-2">
                  {wrongOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1" value={opt} onChange={e => {
                        const updated = [...wrongOptions]; updated[i] = e.target.value; setWrongOptions(updated)
                      }} placeholder={`Wrong option ${i + 1}`} />
                      {wrongOptions.length > 2 && (
                        <button type="button" onClick={() => setWrongOptions(wrongOptions.filter((_, idx) => idx !== i))}
                          className="p-2 rounded-lg hover:bg-red-900/20 text-gray-500 hover:text-red-400 transition-colors shrink-0">
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">{wrongOptions.filter(o => o.trim()).length + 1} total options (including correct answer)</p>
              </div>
            )}

            {/* Rewards */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">$ONUS Reward (per correct)</label>
                <Input type="number" value={onusReward} onChange={e => setOnusReward(Number(e.target.value))} min={1} />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block flex items-center gap-2">
                  <input type="checkbox" checked={starsEligible} onChange={e => setStarsEligible(e.target.checked)} />
                  Stars Prize (fastest correct)
                </label>
                {starsEligible && (
                  <Input type="number" value={starsWinnerCount} onChange={e => setStarsWinnerCount(Number(e.target.value))}
                    min={1} max={100} placeholder="# of winners" />
                )}
              </div>
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Starts At (UTC)</label>
                <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Ends At (UTC)</label>
                <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating || !lyricSnippet.trim() || !correctAnswer.trim() || !audioUrl.trim() || !startsAt || !endsAt}
                className="bg-purple-600 hover:bg-purple-700">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Create Challenge
              </Button>
              <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm() }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submissions Viewer */}
      {viewSubs !== null && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Submissions — #{viewSubs}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setViewSubs(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSubs ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
            ) : submissions.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No submissions yet</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-6 text-xs text-gray-500 font-semibold px-2 py-1 border-b border-gray-800">
                  <span>#</span><span>User</span><span>Answer</span><span>Correct</span><span>Time</span><span>Stars</span>
                </div>
                {submissions.map((s: any) => (
                  <div key={s.id} className={`grid grid-cols-6 text-sm px-2 py-1.5 rounded-lg ${s.is_correct ? "bg-green-900/10" : "bg-red-900/10"}`}>
                    <span className="text-gray-500 text-xs">#{s.rank}</span>
                    <span className="text-white text-xs truncate">{s.username}</span>
                    <span className="text-gray-300 text-xs truncate">{s.answer}</span>
                    <span>{s.is_correct ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}</span>
                    <span className="text-gray-500 text-xs">{new Date(s.submitted_at).toLocaleTimeString()}</span>
                    <span>{s.stars_awarded ? <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Challenge List */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
      ) : challenges.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No challenges yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {challenges.map((c: any) => {
            const isLive = c.status === "live" || (c.status === "scheduled" && new Date(c.starts_at) <= new Date())
            const isEnded = new Date(c.ends_at) <= new Date()
            const displayStatus = isEnded && c.status !== "completed" ? "live (ended)" : c.status

            return (
              <Card key={c.id} className={isLive && !isEnded ? "border-green-500/30 bg-green-950/10" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={STATUS_COLORS[c.status] || "bg-gray-500/20 text-gray-400"}>{displayStatus}</Badge>
                        <Badge variant="outline" className="text-[10px]">{typeLabel(c.type)}</Badge>
                        <span className="text-xs text-yellow-400 font-semibold">+{c.onus_reward} $ONUS</span>
                        {c.stars_eligible && <span className="text-xs text-yellow-300">⭐ Top {c.stars_winner_count}</span>}
                        {c.audio_url && <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">🔊 Audio</Badge>}
                        {c.audio_url && <SignedAudioPreview url={c.audio_url} />}
                        {c.audio_url_2 && <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-400">×3</Badge>}
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed mb-2">
                        {c.lyric_snippet.length > 150 ? c.lyric_snippet.slice(0, 150) + "..." : c.lyric_snippet}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeLeft(c.ends_at)}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.submissionCount} submitted</span>
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {c.correctCount} correct</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">
                        Answer: <span className="text-gray-400">{c.correct_answer}</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => viewSubmissions(c.id)}
                        className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors" title="View submissions">
                        <Eye className="w-4 h-4" />
                      </button>
                      {(isEnded || c.status === "live") && c.status !== "completed" && (
                        <button onClick={() => handleComplete(c.id)} disabled={completing === c.id}
                          className="p-2 rounded-lg hover:bg-green-900/30 text-green-400 transition-colors" title="Complete & reward">
                          {completing === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                        </button>
                      )}
                      <button onClick={() => handleDelete(c.id)}
                        className="p-2 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
