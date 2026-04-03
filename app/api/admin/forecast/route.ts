import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { resolveMultiplier } from "@/lib/constants/tiers"
import { batchAwardOnus } from "@/lib/batch-award-onus"
import crypto from "crypto"

const FORECAST_CORRECT_BASE = 100
const FORECAST_WRONG_BASE = 10

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: forecasts } = await supabase
      .from("fan_forecasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)

    const enriched = []
    for (const f of forecasts || []) {
      const { data: votes } = await supabase
        .from("fan_forecast_votes")
        .select("vote, choice")
        .eq("forecast_id", f.id)

      // Legacy yes/no counts
      let yes = 0, no = 0
      // Multi-choice counts
      const choiceCounts: Record<string, number> = {}

      for (const v of votes || []) {
        if (v.choice) {
          choiceCounts[v.choice] = (choiceCounts[v.choice] || 0) + 1
        } else {
          if (v.vote) yes++; else no++
        }
      }

      enriched.push({
        ...f,
        yesCount: yes,
        noCount: no,
        choiceCounts,
        totalVotes: (votes || []).length,
      })
    }

    return NextResponse.json({ forecasts: enriched })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = await createAdminClient()

    if (action === "create") {
      const { question, artistId, targetValue, periodStart, periodEnd, voteDeadline, choices, choiceRanges } = body

      if (!question || !artistId || !targetValue || !periodStart || !periodEnd || !voteDeadline) {
        return NextResponse.json({ error: "All fields required" }, { status: 400 })
      }

      const insertData: any = {
        question,
        artist_id: artistId,
        target_value: parseInt(targetValue),
        target_period_start: periodStart,
        target_period_end: periodEnd,
        vote_deadline: voteDeadline,
        status: "open",
      }

      // Multi-choice mode
      if (choices && choices.length >= 2) {
        insertData.choices = choices
        insertData.choice_ranges = choiceRanges || null
      }

      const { data, error } = await supabase
        .from("fan_forecasts")
        .insert(insertData)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, forecast: data })
    }

    if (action === "close") {
      const { error } = await supabase
        .from("fan_forecasts")
        .update({ status: "closed" })
        .eq("id", body.forecastId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === "resolve") {
      const { data: forecast } = await supabase
        .from("fan_forecasts")
        .select("*")
        .eq("id", body.forecastId)
        .single()

      if (!forecast) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (forecast.status === "resolved") return NextResponse.json({ error: "Already resolved" }, { status: 409 })

      // Count actual unique listens
      const { data: allTracks } = await supabase
        .from("tracks")
        .select("id, artist")
        .eq("is_active", true)

      const artistTrackIds = (allTracks || [])
        .filter(t => {
          const primary = t.artist.split(/\s+ft\.?\s+|\s+feat\.?\s+/i)[0].trim().toLowerCase().replace(/\s+/g, "-")
          return primary === forecast.artist_id
        })
        .map(t => t.id)

      let actualValue = 0
      let listenerIds: string[] = []

      if (artistTrackIds.length > 0) {
        const { data: listens } = await supabase
          .from("unique_listens")
          .select("telegram_id")
          .in("track_id", artistTrackIds)
          .gte("week_start", forecast.target_period_start)
          .lte("week_start", forecast.target_period_end)

        const unique = new Set((listens || []).map(l => String(l.telegram_id)))
        actualValue = unique.size
        listenerIds = Array.from(unique)
      }

      // Hash proof
      const salt = `apesonus-${forecast.target_period_start}-${forecast.id}`
      const proofHashes = listenerIds
        .map(id => crypto.createHash("sha256").update(id + salt).digest("hex"))
        .sort()

      // Determine winner
      let result: boolean | null = null
      let winningChoice: string | null = null

      if (forecast.choices && forecast.choice_ranges) {
        // Multi-choice: find which range contains actualValue
        const ranges = forecast.choice_ranges as { min: number; max: number }[]
        const labels = forecast.choices as string[]
        for (let i = 0; i < ranges.length; i++) {
          if (actualValue >= ranges[i].min && actualValue <= ranges[i].max) {
            winningChoice = labels[i]
            result = true
            break
          }
        }
        if (!winningChoice && labels.length > 0) {
          winningChoice = labels[labels.length - 1]
          result = true
        }
      } else {
        // Legacy yes/no
        result = actualValue >= forecast.target_value
      }

      // Get votes
      const { data: votes } = await supabase
        .from("fan_forecast_votes")
        .select("id, telegram_id, vote, choice")
        .eq("forecast_id", forecast.id)

      // Fetch tier info
      const voterIds = (votes || []).map(v => v.telegram_id)
      const multiplierMap: Record<string, number> = {}
      if (voterIds.length > 0) {
        const { data: userRecords } = await supabase
          .from("users")
          .select("telegram_id, verification_tier, onus_multiplier")
          .in("telegram_id", voterIds)
        if (userRecords) {
          for (const u of userRecords) {
            multiplierMap[u.telegram_id] = resolveMultiplier(u.onus_multiplier, u.verification_tier)
          }
        }
      }

      // Build awards
      const awardEntries = (votes || []).map(vote => {
        let correct = false
        if (winningChoice && vote.choice) {
          correct = vote.choice === winningChoice
        } else {
          correct = vote.vote === result
        }
        const userMultiplier = multiplierMap[vote.telegram_id] ?? 0.25
        const base = correct ? FORECAST_CORRECT_BASE : FORECAST_WRONG_BASE
        const amount = Math.round(base * userMultiplier)
        return { voteId: vote.id, telegramId: vote.telegram_id, amount, reason: "forecast_reward" as const, referenceId: `forecast_${forecast.id}` }
      })

      const batchResult = await batchAwardOnus(
        supabase,
        awardEntries.map(e => ({ telegramId: e.telegramId, amount: e.amount, reason: e.reason, referenceId: e.referenceId }))
      )

      const awardedMap: Record<string, number> = {}
      for (const r of batchResult.results) awardedMap[r.telegramId] = r.amount

      for (const entry of awardEntries) {
        await supabase.from("fan_forecast_votes")
          .update({ onus_earned: awardedMap[entry.telegramId] || entry.amount })
          .eq("id", entry.voteId)
      }

      await supabase.from("fan_forecasts").update({
        status: "resolved",
        result,
        actual_value: actualValue,
        winning_choice: winningChoice,
        proof_salt: salt,
        proof_hashes: proofHashes,
        resolved_at: new Date().toISOString(),
      }).eq("id", forecast.id)

      return NextResponse.json({
        success: true,
        result: winningChoice || (result ? "YES" : "NO"),
        actualValue,
        targetValue: forecast.target_value,
        winningChoice,
        totalVoters: (votes || []).length,
        totalAwarded: batchResult.totalOnus,
      })
    }

    if (action === "edit") {
      const { forecastId, question, artistId, targetValue, periodStart, periodEnd, voteDeadline, choices, choiceRanges } = body
      if (!forecastId) return NextResponse.json({ error: "forecastId required" }, { status: 400 })

      const updateData: Record<string, any> = {}
      if (question) updateData.question = question
      if (artistId) updateData.artist_id = artistId
      if (targetValue) updateData.target_value = parseInt(targetValue)
      if (periodStart) updateData.target_period_start = periodStart
      if (periodEnd) updateData.target_period_end = periodEnd
      if (voteDeadline) updateData.vote_deadline = voteDeadline
      if (choices) updateData.choices = choices
      if (choiceRanges) updateData.choice_ranges = choiceRanges

      if (Object.keys(updateData).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

      const { error } = await supabase.from("fan_forecasts").update(updateData).eq("id", forecastId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === "delete") {
      const { forecastId } = body
      if (!forecastId) return NextResponse.json({ error: "forecastId required" }, { status: 400 })
      await supabase.from("fan_forecast_votes").delete().eq("forecast_id", forecastId)
      const { error } = await supabase.from("fan_forecasts").delete().eq("id", forecastId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
