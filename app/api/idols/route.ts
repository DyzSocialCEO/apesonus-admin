import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { apiRatelimit } from "@/lib/upstash"
import { validateTelegramId } from "@/lib/validation"
import { signTrackUrls } from "@/lib/bunny-cdn"

// GET /api/idols?telegramId=xxx
export async function GET(request: Request) {
  if (apiRatelimit) {
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    const { success } = await apiRatelimit.limit(`idols:${ip}`)
    if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const telegramId = validateTelegramId(searchParams.get("telegramId"))

  try {
    const supabase = await createAdminClient()

    // Get current live round (most recent live one)
    const { data: round } = await supabase
      .from("idol_rounds")
      .select("*")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!round) {
      // Check for most recent resolved round to show results
      const { data: lastResolved } = await supabase
        .from("idol_rounds")
        .select("*")
        .eq("status", "resolved")
        .order("resolved_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastResolved) {
        const { data: entries } = await supabase
          .from("idol_entries")
          .select("*")
          .eq("round_id", lastResolved.id)
          .order("vote_count", { ascending: false })

        let userVote = null
        if (telegramId) {
          const { data: vote } = await supabase
            .from("idol_votes")
            .select("entry_id, onus_earned")
            .eq("round_id", lastResolved.id)
            .eq("telegram_id", telegramId)
            .maybeSingle()
          userVote = vote
        }

        return NextResponse.json({
          round: { ...lastResolved, entries: entries || [] },
          userVote,
          showResults: true,
        })
      }

      return NextResponse.json({ round: null, userVote: null, showResults: false })
    }

    // Get entries with signed audio URLs
    const { data: entries } = await supabase
      .from("idol_entries")
      .select("*")
      .eq("round_id", round.id)
      .order("artist_id")

    const signedEntries = (entries || []).map(e => {
      try {
        const signed = signTrackUrls(e.audio_url, e.cover_url || "")
        return { ...e, audio_url_signed: signed.audioUrl }
      } catch {
        return { ...e, audio_url_signed: e.audio_url }
      }
    })

    // Check if user already voted
    let userVote = null
    if (telegramId) {
      const { data: vote } = await supabase
        .from("idol_votes")
        .select("entry_id, onus_earned")
        .eq("round_id", round.id)
        .eq("telegram_id", telegramId)
        .maybeSingle()
      userVote = vote
    }

    return NextResponse.json({
      round: { ...round, entries: signedEntries },
      userVote,
      showResults: false,
    })
  } catch (e: any) {
    return NextResponse.json({ round: null, error: e.message }, { status: 500 })
  }
}
