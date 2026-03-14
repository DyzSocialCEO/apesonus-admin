import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { assignTier, TIER_MULTIPLIERS, TIER_CAPS } from "@/lib/constants/tiers"
import { awardOnus } from "@/lib/award-onus"

// GET all users with engagement status
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw error

    // Get active streaks
    const { data: streaks } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, completed_streaks, is_active")
      .eq("is_active", true)

    const streakMap = new Map<string, any>()
    streaks?.forEach((s) => {
      streakMap.set(s.telegram_id, s)
    })

    const enriched = (users || []).map((u) => ({
      ...u,
      streak: streakMap.get(u.telegram_id) || null,
    }))

    return NextResponse.json({ users: enriched })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST - admin actions on users
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { telegramId, action, amount, tier: requestedTier } = await request.json()
    if (!telegramId || !action) {
      return NextResponse.json({ error: "telegramId and action required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // ── GRANT COINS ──
    if (action === "grant_coins") {
      const coinAmount = amount || 50
      await awardOnus(supabase, telegramId, coinAmount, "admin_bonus", `admin_grant_${Date.now()}`)
      return NextResponse.json({ success: true, message: `Granted ${coinAmount} $ONUS` })
    }

    // ── GRANT PREMIUM (free verification) ──
    if (action === "grant_premium") {
      // Check user exists
      const { data: user } = await supabase
        .from("users")
        .select("is_premium, verification_tier")
        .eq("telegram_id", telegramId)
        .maybeSingle()

      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

      if (user.is_premium) {
        return NextResponse.json({ error: "User is already verified" }, { status: 409 })
      }

      // Determine tier — use requested tier or auto-assign based on counter
      let tier: string
      if (requestedTier && ["genesis", "early", "standard"].includes(requestedTier)) {
        tier = requestedTier
      } else {
        const { data: counter } = await supabase
          .from("verification_counter")
          .select("*")
          .eq("id", 1)
          .single()

        const totalVerified = counter
          ? counter.genesis_count + counter.early_count + counter.standard_count
          : 0
        tier = assignTier(totalVerified)
      }

      const multiplier = TIER_MULTIPLIERS[tier as keyof typeof TIER_MULTIPLIERS] || 1

      // Update counter
      const { data: counter } = await supabase
        .from("verification_counter")
        .select("*")
        .eq("id", 1)
        .single()

      if (counter) {
        const counterUpdate: Record<string, any> = { updated_at: new Date().toISOString() }
        if (tier === "genesis") counterUpdate.genesis_count = counter.genesis_count + 1
        else if (tier === "early") counterUpdate.early_count = counter.early_count + 1
        else counterUpdate.standard_count = counter.standard_count + 1

        await supabase.from("verification_counter").update(counterUpdate).eq("id", 1)
      }

      // Update user
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 86400000) // 30 days

      await supabase.from("users").update({
        is_premium: true,
        is_verified: true,
        verification_tier: tier,
        onus_multiplier: multiplier,
        premium_expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      }).eq("telegram_id", telegramId)

      // Create subscription record
      await supabase.from("premium_subscriptions").insert({
        telegram_id: telegramId,
        ton_wallet: null,
        amount_nano: 0,
        currency: "ADMIN_GRANT",
        tx_hash: `admin_grant_${telegramId}_${Date.now()}`,
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: "active",
        verified_at: now.toISOString(),
      }).catch(() => {}) // non-critical

      // Activation bonus
      const activationBonus = multiplier * 100
      await awardOnus(supabase, telegramId, activationBonus, "premium_activation", `admin_grant_${Date.now()}`)

      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
      return NextResponse.json({
        success: true,
        message: `Granted ${tierLabel} verification (${multiplier}×) + ${activationBonus} $ONUS bonus. Expires ${expiresAt.toLocaleDateString()}.`,
      })
    }

    // ── REVOKE PREMIUM ──
    if (action === "revoke_premium") {
      await supabase.from("users").update({
        is_premium: false,
        is_verified: false,
        premium_expires_at: null,
        // Keep verification_tier and onus_multiplier — those are permanent
        updated_at: new Date().toISOString(),
      }).eq("telegram_id", telegramId)

      // Cancel active subscriptions
      await supabase
        .from("premium_subscriptions")
        .update({ status: "cancelled" })
        .eq("telegram_id", telegramId)
        .eq("status", "active")

      return NextResponse.json({ success: true, message: "Premium revoked. Card tier preserved." })
    }

    // ── Legacy verify/unverify (keep for compat) ──
    if (action === "verify_user") {
      await supabase.from("users")
        .update({ is_verified: true, verified_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "User verified" })
    }

    if (action === "unverify_user") {
      await supabase.from("users")
        .update({ is_verified: false, verified_at: null })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "Verification removed" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error managing user:", error)
    return NextResponse.json({ error: "Failed to manage user" }, { status: 500 })
  }
}
