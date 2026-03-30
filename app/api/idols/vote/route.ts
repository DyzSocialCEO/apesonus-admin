import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { apiRatelimit } from "@/lib/upstash"
import { getAuthenticatedUser } from "@/lib/auth-session"
import { validateTelegramId } from "@/lib/validation"

// POST /api/idols/vote — { entryId, telegramId }
export async function POST(request: Request) {
  try {
    if (apiRatelimit) {
      const ip = request.headers.get("x-forwarded-for") || "unknown"
      const { success } = await apiRatelimit.limit(`idol-vote:${ip}`)
      if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await request.json()
    const { entryId } = body

    // Auth: try JWT first, fall back to body telegramId
    let telegramId: string | null = null
    try {
      const auth = await getAuthenticatedUser(request, {})
      telegramId = auth.telegramId
    } catch {}

    if (!telegramId) {
      telegramId = validateTelegramId(body.telegramId)
    }

    if (!telegramId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    if (!entryId) {
      return NextResponse.json({ error: "Entry ID required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Verify entry exists and round is live
    const { data: entry } = await supabase
      .from("idol_entries")
      .select("id, round_id")
      .eq("id", entryId)
      .single()

    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 })

    const { data: round } = await supabase
      .from("idol_rounds")
      .select("status, vote_deadline")
      .eq("id", entry.round_id)
      .single()

    if (!round || round.status !== "live") {
      return NextResponse.json({ error: "Voting is not open for this round" }, { status: 400 })
    }

    // Check deadline
    if (round.vote_deadline && new Date(round.vote_deadline) < new Date()) {
      return NextResponse.json({ error: "Voting deadline has passed" }, { status: 400 })
    }

    // Check existing vote (upsert: allow changing vote)
    const { data: existing } = await supabase
      .from("idol_votes")
      .select("id, entry_id")
      .eq("round_id", entry.round_id)
      .eq("telegram_id", telegramId)
      .maybeSingle()

    if (existing) {
      if (existing.entry_id === entryId) {
        return NextResponse.json({ success: true, message: "Already voted for this entry" })
      }
      // Update vote
      await supabase
        .from("idol_votes")
        .update({ entry_id: entryId })
        .eq("id", existing.id)

      return NextResponse.json({ success: true, message: "Vote changed", changed: true })
    }

    // Insert new vote
    const { error: voteErr } = await supabase.from("idol_votes").insert({
      round_id: entry.round_id,
      entry_id: entryId,
      telegram_id: telegramId,
    })

    if (voteErr) {
      if (voteErr.code === "23505") {
        return NextResponse.json({ success: true, message: "Already voted" })
      }
      return NextResponse.json({ error: voteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Vote cast!" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
