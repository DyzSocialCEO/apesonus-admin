import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

const TELEGRAM_RATE_LIMIT = 25 // msgs per second (TG limit is 30, we stay under)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * POST /api/admin/broadcast
 * Sends a message to all users (or verified-only) via Telegram Bot API.
 * Batched at 25/sec to respect Telegram rate limits.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { message, verifiedOnly, preview } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: "Bot token not configured" }, { status: 500 })
    }

    const supabase = await createAdminClient()

    // Get target users
    let query = supabase.from("users").select("telegram_id")
    if (verifiedOnly) {
      query = query.eq("is_premium", true)
    }

    const { data: users } = await query

    if (!users || users.length === 0) {
      return NextResponse.json({ error: "No users found", sent: 0, failed: 0 })
    }

    // Preview mode — return count without sending
    if (preview) {
      return NextResponse.json({
        preview: true,
        targetCount: users.length,
        verifiedOnly: !!verifiedOnly,
      })
    }

    // Send in batches
    let sent = 0
    let failed = 0
    let blocked = 0

    for (let i = 0; i < users.length; i++) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: users[i].telegram_id,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        })

        const result = await res.json()

        if (result.ok) {
          sent++
        } else {
          failed++
          // User blocked the bot
          if (result.error_code === 403) blocked++
        }
      } catch {
        failed++
      }

      // Rate limiting: pause every batch to stay under 25/sec
      if ((i + 1) % TELEGRAM_RATE_LIMIT === 0 && i + 1 < users.length) {
        await sleep(1100) // 1.1 seconds between batches
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      blocked,
      total: users.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Broadcast failed" }, { status: 500 })
  }
}
