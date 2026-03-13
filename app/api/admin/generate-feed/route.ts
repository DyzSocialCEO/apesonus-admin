import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { ARTIST_ROSTER } from "@/lib/constants/artists"

// ============================================
// POST /api/admin/generate-feed
// Generates AI draft posts using real context + artist bibles
// ============================================

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = "google/gemini-flash-1.5"

const POST_CATEGORIES = [
  "market_reaction",
  "mood_pulse_reaction",
  "chart_reaction",
  "prediction_energy",
  "artist_shade",
  "personality",
  "song_link",
] as const

type PostCategory = typeof POST_CATEGORIES[number]

const CATEGORY_TO_POST_TYPE: Record<PostCategory, string> = {
  market_reaction: "take",
  mood_pulse_reaction: "take",
  chart_reaction: "take",
  prediction_energy: "alpha",
  artist_shade: "quote",
  personality: "quote",
  song_link: "drop",
}

// ============================================
// MASTER SYSTEM PROMPT — baked from the feed bible
// ============================================
const SYSTEM_PROMPT = `You are writing social feed posts for Apesonus, a music-first crypto culture app with fictional artists who react to crypto life in their own voice.

These posts must feel like real crypto Twitter / Telegram energy. Typed quickly from instinct. Casual, reactive, flawed, biased, sometimes sharp, sometimes mid.

HARD ANTI-AI RULES — NEVER DO THESE:
- over-explained metaphors
- "dressed in X" poetic language  
- "the candle was not red, it was a confession" type writing
- every line trying to sound iconic
- "this is not X, this is Y" constructions
- dramatic life lesson endings
- motivational monologue tone
- perfect clean literary writing
- "performing intelligence"
- too much polished symmetry in sentence structure
- em dash-heavy writing
- moral-of-the-story endings
- fake introspection
- every post sounding like it belongs on a poster
- hashtags
- excessive emojis

ALLOWED:
- casual slang, slightly messy grammar, abrupt thoughts
- dry takes, wrong takes, bias, pettiness
- shameless self-promotion, half-baked reactions
- "lmaooo", "bro", "nah", "please", "i beg", "anyway" etc. where natural
- lowercase if it fits the artist
- unfinished thoughts

LENGTH: 1-3 short lines max. Usually 1-2 sentences. Readable in under 5 seconds.

The standard is: real-feeling > clever-feeling.
Every post should sound like someone had a thought and typed it in 15 seconds.

Artists are allowed to be wrong about markets, charts, predictions, and how good they think they are.
Artists may NOT be wrong about app rules, ONUS mechanics, or platform features.

You must respond ONLY with valid JSON. No markdown, no backticks, no preamble.`

// ============================================
// ARTIST VOICE PROMPTS
// ============================================
const VOICE_RULES: Record<string, string> = {
  "aunty-rugsy": "You are Aunty Rugsy. Tired wisdom. Suspicious by default. Warns people. Sounds like she has seen too much. Sometimes too negative. Sometimes wrong because she expects disaster. Never polished or corporate. Types clean but blunt.",
  "chartnobyl-bro": "You are Chartnobyl Bro. Overconfident. Unserious. Chaotic pattern addict. Loves saying 'this happened before'. Confidently wrong sometimes. Doesn't mind sounding ridiculous. Never cautious for long. Types in caps sometimes when hyped.",
  "lola-likwidity": "You are Lola Likwidity. Smooth. Sharp. Emotionally observant. Not noisy. More likely to comment on energy than make hard chart calls. Never sloppy. Types clean and measured.",
  "satoshi-deluxe": "You are Satoshi Deluxe. Calm. Detached. Composed. Reflective without becoming fake-deep. Rarely emotional. Wrong sometimes in a 'too patient' way. Never loud, never thirsty.",
  "miss-candlesticker": "You are Miss Candlesticker. Slightly bitter because she was right before and nobody listened. Technical but still human. Tired of repeating herself. Can be smug. Never hype-driven.",
  "shill-shady": "You are Shill Shady. Shameless. Self-serving. Says whatever benefits him. People should not fully trust him. Funny because he knows he's full of it. Never morally sincere for long. Types fast and messy.",
  "coinalisa": "You are Coinalisa. Elegant. Composed. Emotionally accurate. Polished but still human. Reacts more than predicts. Subtle shade, not loud shade. Never frantic.",
  "down-bad-dave": "You are Down Bad Dave. Self-aware. Tired but still in it. Funny in a losing way. Emotionally honest. Can laugh at himself. Never sounds like a winner for too long. Types lowercase mostly.",
  "shilliam-dafoe": "You are Shilliam Dafoe. Intense. Committed. A little theatrical. Slightly unhinged. Can sound too serious about nonsense. Sometimes convincing even when ridiculous. Never boring.",
  "satosheek": "You are Satosheek. Raw. Late-night honesty. Says things that hit because they're true not because they're poetic. Not polished. Types like a real person after staring at charts too long. Never overly literary.",
}

// ============================================
// FETCH REAL CONTEXT
// ============================================
async function fetchMarketData(): Promise<string> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return "Market data unavailable."
    const data = await res.json()
    const btc = data.bitcoin
    const eth = data.ethereum
    const sol = data.solana
    const parts: string[] = []
    if (btc) parts.push(`BTC: $${Math.round(btc.usd).toLocaleString()} (${btc.usd_24h_change > 0 ? "+" : ""}${btc.usd_24h_change?.toFixed(1)}% 24h)`)
    if (eth) parts.push(`ETH: $${Math.round(eth.usd).toLocaleString()} (${eth.usd_24h_change > 0 ? "+" : ""}${eth.usd_24h_change?.toFixed(1)}% 24h)`)
    if (sol) parts.push(`SOL: $${Math.round(sol.usd).toLocaleString()} (${sol.usd_24h_change > 0 ? "+" : ""}${sol.usd_24h_change?.toFixed(1)}% 24h)`)
    return parts.join(" | ") || "Market data unavailable."
  } catch {
    return "Market data unavailable."
  }
}

async function fetchMoodPulse(supabase: any): Promise<string> {
  try {
    const today = new Date().toISOString().split("T")[0]
    const { data: votes } = await supabase
      .from("daily_mood_votes")
      .select("mood")
      .eq("vote_date", today)

    if (!votes || votes.length === 0) return "No mood pulse data today."

    const counts: Record<string, number> = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
    for (const v of votes) counts[v.mood] = (counts[v.mood] || 0) + 1
    const total = votes.length
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    const pcts = Object.entries(counts)
      .map(([mood, count]) => `${mood.toUpperCase()}: ${Math.round((count / total) * 100)}%`)
      .join(", ")

    return `Today's mood pulse (${total} votes): ${pcts}. Dominant mood: ${dominant[0].toUpperCase()} at ${Math.round((dominant[1] / total) * 100)}%.`
  } catch {
    return "Mood pulse data unavailable."
  }
}

async function fetchChartContext(supabase: any): Promise<string> {
  try {
    const now = new Date()
    const dayOfWeek = now.getUTCDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - mondayOffset)
    weekStart.setUTCHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split("T")[0]

    const { data: listens } = await supabase
      .from("unique_listens")
      .select("track_id")
      .eq("week_start", weekStartStr)

    if (!listens || listens.length === 0) return "No chart data this week yet."

    const countMap: Record<number, number> = {}
    for (const l of listens) countMap[l.track_id] = (countMap[l.track_id] || 0) + 1

    const ranked = Object.entries(countMap)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([id]) => Number(id))

    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, artist")
      .in("id", ranked)

    if (!tracks) return "Chart data unavailable."

    const trackMap: Record<number, any> = {}
    for (const t of tracks) trackMap[t.id] = t

    const chart = ranked
      .filter(id => trackMap[id])
      .map((id, i) => `#${i + 1}: "${trackMap[id].title}" by ${trackMap[id].artist} (${countMap[id]} listeners)`)
      .join(", ")

    return `This week's top tracks: ${chart}`
  } catch {
    return "Chart data unavailable."
  }
}

async function fetchRecentPosts(supabase: any): Promise<Record<string, number>> {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
    const { data } = await supabase
      .from("artist_posts")
      .select("artist_id, created_at")
      .gte("created_at", twoDaysAgo)
      .eq("is_published", true)

    const counts: Record<string, number> = {}
    if (data) {
      for (const p of data) counts[p.artist_id] = (counts[p.artist_id] || 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}

// ============================================
// PICK ARTISTS FOR TODAY
// ============================================
function pickArtists(recentPosts: Record<string, number>, count: number): string[] {
  const artistIds = Object.keys(VOICE_RULES)
  
  // Weight artists who haven't posted recently higher
  const weighted = artistIds.map(id => ({
    id,
    weight: Math.max(0.1, 1 - (recentPosts[id] || 0) * 0.4) + Math.random() * 0.5,
  }))

  weighted.sort((a, b) => b.weight - a.weight)
  return weighted.slice(0, count).map(w => w.id)
}

// ============================================
// ASSIGN CATEGORIES
// ============================================
function assignCategories(artists: string[], requestedCategories?: string[]): Array<{ artistId: string; category: PostCategory }> {
  const categories: PostCategory[] = requestedCategories?.length
    ? requestedCategories as PostCategory[]
    : [
        "market_reaction",
        "mood_pulse_reaction",
        "chart_reaction",
        "prediction_energy",
        "personality",
      ]

  // Shuffle and assign
  const shuffled = [...categories].sort(() => Math.random() - 0.5)
  return artists.map((artistId, i) => ({
    artistId,
    category: shuffled[i % shuffled.length],
  }))
}

// ============================================
// GENERATE A SINGLE POST VIA OPENROUTER
// ============================================
async function generatePost(
  artistId: string,
  category: PostCategory,
  context: { market: string; moodPulse: string; chart: string; dayOfWeek: string }
): Promise<{ artistId: string; content: string; postType: string; category: PostCategory } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const voice = VOICE_RULES[artistId]
  if (!voice) return null

  const artistProfile = Object.values(ARTIST_ROSTER).find(a => a.id === artistId)
  const artistName = artistProfile?.name || artistId

  const categoryPrompts: Record<PostCategory, string> = {
    market_reaction: `Write a short reaction to today's market. ${context.market}`,
    mood_pulse_reaction: `React to today's in-app mood pulse data. ${context.moodPulse}`,
    chart_reaction: `React to the current chart standings. ${context.chart}`,
    prediction_energy: `It's ${context.dayOfWeek}. Shape how people feel about this week's top-3 prediction. Not a formal prediction — just confidence, doubt, flexing, or coping about chart position.`,
    artist_shade: `Write a light, funny comment about another Apesonus artist. Keep it playful not mean. Pick any artist that isn't you.`,
    personality: `Write a small random post that reveals your personality. A weird chart habit, delusional confidence, tiredness, a dumb market ritual, anything human.`,
    song_link: `Casually mention one of your tracks or your mood world. Not a hard ad — just a natural reference. You make music in the ${artistProfile?.moods.join("/") || "cope"} world.`,
  }

  const userPrompt = `${voice}

Your artist name is ${artistName}.

CONTEXT:
Market: ${context.market}
Mood Pulse: ${context.moodPulse}
Chart: ${context.chart}
Day: ${context.dayOfWeek}

TASK: ${categoryPrompts[category]}

Generate exactly 3 candidate posts as a JSON array. Each candidate is a string.
Pick different angles — one sharper, one more casual, one more mid.
Keep each post 1-3 short lines. Most should be 1-2 sentences.

Respond with ONLY this JSON format, nothing else:
{"candidates": ["post 1 text", "post 2 text", "post 3 text"]}`

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.apesonus.com",
        "X-Title": "APESONUS Feed Generator",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`OpenRouter error for ${artistId}:`, err)
      return null
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return null

    // Parse JSON — handle potential markdown wrapping
    const clean = text.replace(/```json\n?|```\n?/g, "").trim()
    const parsed = JSON.parse(clean)
    const candidates = parsed.candidates || parsed

    if (!Array.isArray(candidates) || candidates.length === 0) return null

    return {
      artistId,
      content: candidates[0], // first candidate shown by default, others available for review
      postType: CATEGORY_TO_POST_TYPE[category],
      category,
      candidates, // all 3 for admin to pick from
    } as any
  } catch (e) {
    console.error(`Generation failed for ${artistId}:`, e)
    return null
  }
}

// ============================================
// MAIN HANDLER
// ============================================
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const artistCount = Math.min(Math.max(body.artistCount || 4, 2), 6)
    const requestedCategories = body.categories || null

    const supabase = await createAdminClient()

    // Gather real context in parallel
    const [market, moodPulse, chart, recentPosts] = await Promise.all([
      fetchMarketData(),
      fetchMoodPulse(supabase),
      fetchChartContext(supabase),
      fetchRecentPosts(supabase),
    ])

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeek = days[new Date().getUTCDay()]

    // Pick artists and assign categories
    const selectedArtists = pickArtists(recentPosts, artistCount)
    const assignments = assignCategories(selectedArtists, requestedCategories)

    // Generate posts in parallel
    const context = { market, moodPulse, chart, dayOfWeek }
    const results = await Promise.all(
      assignments.map(a => generatePost(a.artistId, a.category, context))
    )

    const drafts = results.filter(Boolean)

    return NextResponse.json({
      drafts,
      context: { market, moodPulse, chart, dayOfWeek },
      selectedArtists,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Generation failed" }, { status: 500 })
  }
}
