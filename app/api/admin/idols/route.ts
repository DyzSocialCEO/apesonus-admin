import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { resolveMultiplier } from "@/lib/constants/tiers"
import { batchAwardOnus } from "@/lib/batch-award-onus"

const ARTISTS = [
  { id: "chartnobyl-bro", name: "Chartnobyl Bro" },
  { id: "coinalisa", name: "Coinalisa" },
  { id: "dj-dustwallet", name: "DJ Dustwallet" },
  { id: "lola-likwidity", name: "Lola Likwidity" },
  { id: "mcbagholder", name: "McBagholder" },
  { id: "shilliam-dafoe", name: "Shilliam Dafoe" },
  { id: "satosheek", name: "Satosheek" },
]

// GET — list all idol rounds
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: rounds } = await supabase
      .from("idol_rounds")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)

    // Enrich with entries and vote counts
    const enriched = []
    for (const r of rounds || []) {
      const { data: entries } = await supabase
        .from("idol_entries")
        .select("*")
        .eq("round_id", r.id)
        .order("artist_id")

      const { data: votes } = await supabase
        .from("idol_votes")
        .select("entry_id")
        .eq("round_id", r.id)

      // Count votes per entry
      const voteCounts: Record<number, number> = {}
      for (const v of votes || []) {
        voteCounts[v.entry_id] = (voteCounts[v.entry_id] || 0) + 1
      }

      enriched.push({
        ...r,
        entries: (entries || []).map(e => ({ ...e, vote_count: voteCounts[e.id] || 0 })),
        total_votes: (votes || []).length,
      })
    }

    // Also fetch today's dominant pulse mood
    const today = new Date().toISOString().split("T")[0]
    const { data: todayVotes } = await supabase
      .from("daily_mood_votes")
      .select("mood")
      .eq("vote_date", today)

    const moodCounts: Record<string, number> = { moon: 0, rekt: 0, cope: 0, degen: 0, zen: 0 }
    for (const v of todayVotes || []) {
      if (moodCounts[v.mood] !== undefined) moodCounts[v.mood]++
    }
    let dominantMood = "moon"
    let maxCount = 0
    for (const [mood, count] of Object.entries(moodCounts)) {
      if (count > maxCount) { maxCount = count; dominantMood = mood }
    }

    return NextResponse.json({ rounds: enriched, dominantMood, artists: ARTISTS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

// POST — create, update, resolve, or delete
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    // ── CREATE ROUND ──
    if (action === "create") {
      const { title, mood, rewardPool, voteDeadline, entries } = body
      if (!title || !mood || !entries || entries.length !== 7) {
        return NextResponse.json({ error: "Title, mood, and 7 entries required" }, { status: 400 })
      }

      const { data: round, error: roundErr } = await supabase
        .from("idol_rounds")
        .insert({
          title,
          mood,
          reward_pool: rewardPool || 50000,
          vote_deadline: voteDeadline || null,
          status: "draft",
        })
        .select()
        .single()

      if (roundErr) return NextResponse.json({ error: roundErr.message }, { status: 500 })

      // Insert 7 entries
      const entryRows = entries.map((e: any) => ({
        round_id: round.id,
        artist_id: e.artistId,
        artist_name: e.artistName,
        audio_url: e.audioUrl,
        cover_url: e.coverUrl || null,
        duration: e.duration || 0,
      }))

      const { error: entryErr } = await supabase.from("idol_entries").insert(entryRows)
      if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

      return NextResponse.json({ success: true, round })
    }

    // ── GO LIVE ──
    if (action === "go_live") {
      const { roundId } = body
      const { error } = await supabase
        .from("idol_rounds")
        .update({ status: "live", updated_at: new Date().toISOString() })
        .eq("id", roundId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── CLOSE VOTING ──
    if (action === "close_voting") {
      const { roundId } = body
      const { error } = await supabase
        .from("idol_rounds")
        .update({ status: "voting_closed", updated_at: new Date().toISOString() })
        .eq("id", roundId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── RESOLVE ──
    if (action === "resolve") {
      const { roundId } = body

      const { data: round } = await supabase
        .from("idol_rounds")
        .select("*")
        .eq("id", roundId)
        .single()

      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 })
      if (round.status === "resolved") return NextResponse.json({ error: "Already resolved" }, { status: 409 })

      // Get all entries with vote counts
      const { data: entries } = await supabase
        .from("idol_entries")
        .select("*")
        .eq("round_id", roundId)

      const { data: allVotes } = await supabase
        .from("idol_votes")
        .select("*")
        .eq("round_id", roundId)

      // Count votes per entry
      const voteCounts: Record<number, number> = {}
      for (const v of allVotes || []) {
        voteCounts[v.entry_id] = (voteCounts[v.entry_id] || 0) + 1
      }

      // Find winner (most votes)
      let winnerEntry = entries?.[0]
      let maxVotes = 0
      for (const e of entries || []) {
        const c = voteCounts[e.id] || 0
        if (c > maxVotes) { maxVotes = c; winnerEntry = e }
      }

      if (!winnerEntry) return NextResponse.json({ error: "No entries found" }, { status: 400 })

      // Get winning voters
      const winningVotes = (allVotes || []).filter(v => v.entry_id === winnerEntry!.id)

      // Fetch tier info for all winning voters
      const winnerTgIds = winningVotes.map(v => v.telegram_id)
      const multiplierMap: Record<string, number> = {}
      if (winnerTgIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("telegram_id, verification_tier, onus_multiplier")
          .in("telegram_id", winnerTgIds)
        if (users) {
          for (const u of users) {
            multiplierMap[u.telegram_id] = resolveMultiplier(u.onus_multiplier, u.verification_tier)
          }
        }
      }

      // Calculate rewards: pool split among winners, scaled by tier
      const pool = round.reward_pool
      const basePerWinner = winningVotes.length > 0 ? Math.floor(pool / winningVotes.length) : 0

      const awardEntries = winningVotes.map(v => ({
        telegramId: v.telegram_id,
        amount: Math.round(basePerWinner * (multiplierMap[v.telegram_id] ?? 0.25)),
        reason: "idol_vote_reward" as const,
        referenceId: `idol_${roundId}`,
      }))

      // Award ONUS
      let totalAwarded = 0
      if (awardEntries.length > 0) {
        const result = await batchAwardOnus(supabase, awardEntries)
        totalAwarded = result.totalOnus

        // Update each vote record with earned amount
        for (const entry of awardEntries) {
          await supabase
            .from("idol_votes")
            .update({ onus_earned: entry.amount })
            .eq("round_id", roundId)
            .eq("telegram_id", entry.telegramId)
        }
      }

      // Update round
      await supabase.from("idol_rounds").update({
        status: "resolved",
        winner_artist: winnerEntry.artist_id,
        winner_entry_id: winnerEntry.id,
        total_votes: (allVotes || []).length,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", roundId)

      // Update entry vote counts
      for (const e of entries || []) {
        await supabase.from("idol_entries")
          .update({ vote_count: voteCounts[e.id] || 0 })
          .eq("id", e.id)
      }

      // Add winning track to catalog
      const { error: trackErr } = await supabase.from("tracks").insert({
        title: round.title,
        artist: winnerEntry.artist_name,
        mood: round.mood,
        audio: winnerEntry.audio_url,
        cover: winnerEntry.cover_url || "",
        duration: winnerEntry.duration || 0,
        is_active: true,
        is_featured: false,
        is_editors_choice: false,
        play_count: 0,
        sort_order: 0,
      })

      return NextResponse.json({
        success: true,
        winner: winnerEntry.artist_name,
        winnerVotes: maxVotes,
        totalVotes: (allVotes || []).length,
        totalAwarded,
        winnersCount: winningVotes.length,
        trackAdded: !trackErr,
      })
    }

    // ── DELETE ──
    if (action === "delete") {
      const { roundId } = body
      await supabase.from("idol_votes").delete().eq("round_id", roundId)
      await supabase.from("idol_entries").delete().eq("round_id", roundId)
      await supabase.from("idol_rounds").delete().eq("id", roundId)
      return NextResponse.json({ success: true })
    }

    // ── UPDATE ──
    if (action === "update") {
      const { roundId, title, mood, rewardPool, voteDeadline } = body
      const update: any = { updated_at: new Date().toISOString() }
      if (title) update.title = title
      if (mood) update.mood = mood
      if (rewardPool) update.reward_pool = rewardPool
      if (voteDeadline) update.vote_deadline = voteDeadline

      const { error } = await supabase.from("idol_rounds").update(update).eq("id", roundId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
