import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { awardOnus } from "@/lib/award-onus"
import { resolveMultiplier } from "@/lib/constants/tiers"

// GET — list all challenges
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    let query = supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (status) query = query.eq("status", status)

    const { data, error } = await query
    if (error) throw error

    // Auto-update statuses based on time
    const now = new Date()
    const updated = (data || []).map(c => {
      if (c.status === "scheduled" && new Date(c.starts_at) <= now) {
        return { ...c, status: "live" }
      }
      if (c.status === "live" && new Date(c.ends_at) <= now) {
        return { ...c, status: "completed" }
      }
      return c
    })

    // Get submission counts per challenge
    const challengeIds = updated.map(c => c.id)
    let subCounts: Record<number, { total: number; correct: number }> = {}

    if (challengeIds.length > 0) {
      const { data: subs } = await supabase
        .from("challenge_submissions")
        .select("challenge_id, is_correct")
        .in("challenge_id", challengeIds)

      if (subs) {
        for (const s of subs) {
          if (!subCounts[s.challenge_id]) subCounts[s.challenge_id] = { total: 0, correct: 0 }
          subCounts[s.challenge_id].total++
          if (s.is_correct) subCounts[s.challenge_id].correct++
        }
      }
    }

    const enriched = updated.map(c => ({
      ...c,
      submissionCount: subCounts[c.id]?.total || 0,
      correctCount: subCounts[c.id]?.correct || 0,
    }))

    return NextResponse.json({ challenges: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — create, update, delete, complete challenges
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    // ── CREATE ──
    if (action === "create") {
      const { type, trackId, lyricSnippet, audioUrl, audioUrl2, audioUrl3, correctAnswer, options, onusReward, starsEligible, starsWinnerCount, startsAt, endsAt } = body

      if (!type || !lyricSnippet || !correctAnswer || !options || !startsAt || !endsAt) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      }

      if (!Array.isArray(options) || options.length < 2) {
        return NextResponse.json({ error: "At least 2 options required" }, { status: 400 })
      }

      if (!options.includes(correctAnswer)) {
        return NextResponse.json({ error: "Correct answer must be in options" }, { status: 400 })
      }

      const startTime = new Date(startsAt)
      const endTime = new Date(endsAt)
      const now = new Date()

      let status = "draft"
      if (startTime <= now && endTime > now) status = "live"
      else if (startTime > now) status = "scheduled"

      const { data, error } = await supabase
        .from("challenges")
        .insert({
          type,
          track_id: trackId || null,
          lyric_snippet: lyricSnippet,
          audio_url: audioUrl || null,
          audio_url_2: audioUrl2 || null,
          audio_url_3: audioUrl3 || null,
          correct_answer: correctAnswer,
          options: JSON.stringify(options),
          onus_reward: onusReward || 50,
          stars_eligible: starsEligible || false,
          stars_winner_count: starsWinnerCount || 0,
          starts_at: startsAt,
          ends_at: endsAt,
          status,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, challenge: data })
    }

    // ── UPDATE ──
    if (action === "update") {
      const { id, ...fields } = body
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

      const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
      if (fields.lyricSnippet !== undefined) updateData.lyric_snippet = fields.lyricSnippet
      if (fields.audioUrl !== undefined) updateData.audio_url = fields.audioUrl || null
      if (fields.audioUrl2 !== undefined) updateData.audio_url_2 = fields.audioUrl2 || null
      if (fields.audioUrl3 !== undefined) updateData.audio_url_3 = fields.audioUrl3 || null
      if (fields.correctAnswer !== undefined) updateData.correct_answer = fields.correctAnswer
      if (fields.options !== undefined) updateData.options = JSON.stringify(fields.options)
      if (fields.onusReward !== undefined) updateData.onus_reward = fields.onusReward
      if (fields.starsEligible !== undefined) updateData.stars_eligible = fields.starsEligible
      if (fields.starsWinnerCount !== undefined) updateData.stars_winner_count = fields.starsWinnerCount
      if (fields.startsAt !== undefined) updateData.starts_at = fields.startsAt
      if (fields.endsAt !== undefined) updateData.ends_at = fields.endsAt
      if (fields.status !== undefined) updateData.status = fields.status

      const { error } = await supabase.from("challenges").update(updateData).eq("id", id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── DELETE ──
    if (action === "delete") {
      const { id } = body
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

      const { error } = await supabase.from("challenges").delete().eq("id", id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── COMPLETE (reveal + distribute rewards) ──
    if (action === "complete") {
      const { id } = body
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

      const { data: challenge } = await supabase
        .from("challenges")
        .select("*")
        .eq("id", id)
        .single()

      if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 })

      // Mark as completed + revealed
      await supabase
        .from("challenges")
        .update({ status: "completed", is_revealed: true, updated_at: new Date().toISOString() })
        .eq("id", id)

      // Get all submissions
      const { data: submissions } = await supabase
        .from("challenge_submissions")
        .select("*")
        .eq("challenge_id", id)
        .order("submitted_at", { ascending: true })

      if (!submissions || submissions.length === 0) {
        return NextResponse.json({ success: true, message: "No submissions", awarded: 0 })
      }

      // Award ONUS to correct answers — scaled by user's tier multiplier
      let awarded = 0
      let starsAwarded = 0
      let totalOnusDistributed = 0
      const correctSubs = submissions.filter(s => s.is_correct)

      // Batch-fetch all correct users' multipliers
      const correctTgIds = correctSubs.map(s => s.telegram_id)
      const { data: userRecords } = await supabase
        .from("users")
        .select("telegram_id, onus_multiplier, verification_tier")
        .in("telegram_id", correctTgIds)

      const multiplierMap: Record<string, number> = {}
      if (userRecords) {
        for (const u of userRecords) {
          multiplierMap[u.telegram_id] = resolveMultiplier(u.onus_multiplier, u.verification_tier)
        }
      }

      for (let i = 0; i < correctSubs.length; i++) {
        const sub = correctSubs[i]
        const userMultiplier = multiplierMap[sub.telegram_id] ?? 0.25 // free = 0.25×
        const reward = Math.floor(challenge.onus_reward * Math.max(userMultiplier, 0.25))

        // Award ONUS
        await awardOnus(supabase, sub.telegram_id, reward, "challenge_reward", `challenge_${id}`)
        awarded++
        totalOnusDistributed += reward

        // Mark Stars-eligible (fastest N correct)
        const isStarsWinner = challenge.stars_eligible && i < challenge.stars_winner_count

        await supabase
          .from("challenge_submissions")
          .update({
            onus_awarded: reward,
            stars_awarded: isStarsWinner,
          })
          .eq("id", sub.id)

        if (isStarsWinner) starsAwarded++
      }

      return NextResponse.json({
        success: true,
        totalSubmissions: submissions.length,
        correctSubmissions: correctSubs.length,
        onusAwarded: awarded,
        totalOnusDistributed,
        starsAwarded,
      })
    }

    // ── SUBMISSIONS (view for a challenge) ──
    if (action === "submissions") {
      const { id } = body
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

      const { data, error } = await supabase
        .from("challenge_submissions")
        .select("*")
        .eq("challenge_id", id)
        .order("submitted_at", { ascending: true })

      if (error) throw error

      // Get usernames
      const telegramIds = [...new Set((data || []).map(s => s.telegram_id))]
      let userMap: Record<string, string> = {}
      if (telegramIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("telegram_id, username, first_name")
          .in("telegram_id", telegramIds)
        if (users) {
          for (const u of users) {
            userMap[u.telegram_id] = u.username || u.first_name || u.telegram_id
          }
        }
      }

      const enriched = (data || []).map((s, i) => ({
        ...s,
        username: userMap[s.telegram_id] || s.telegram_id,
        rank: i + 1,
      }))

      return NextResponse.json({ submissions: enriched })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
