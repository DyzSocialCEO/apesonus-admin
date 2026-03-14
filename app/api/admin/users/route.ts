import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { assignTier, TIER_MULTIPLIERS } from "@/lib/constants/tiers"
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

    const { data: streaks } = await supabase
      .from("user_streaks")
      .select("telegram_id, current_day, completed_streaks, is_active")
      .eq("is_active", true)

    const streakMap = new Map<string, any>()
    streaks?.forEach((s) => streakMap.set(s.telegram_id, s))

    const enriched = (users || []).map((u) => ({
      ...u,
      streak: streakMap.get(u.telegram_id) || null,
    }))

    return NextResponse.json({ users: enriched })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST - admin actions on users
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { telegramId, action, amount, tier: requestedTier } = body
    if (!telegramId || !action) {
      return NextResponse.json({ error: "telegramId and action required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // ── GRANT COINS ──
    if (action === "grant_coins") {
      const coinAmount = amount || 100
      const ok = await awardOnus(supabase, telegramId, coinAmount, "admin_bonus", `admin_grant_${Date.now()}`)
      if (!ok) return NextResponse.json({ error: "Failed to grant ONUS" }, { status: 500 })
      return NextResponse.json({ success: true, message: `Granted ${coinAmount} $ONUS` })
    }

    // ── GRANT PREMIUM ──
    if (action === "grant_premium") {
      // Check user exists
      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("is_premium, verification_tier")
        .eq("telegram_id", telegramId)
        .maybeSingle()

      if (userErr) {
        console.error("grant_premium user lookup error:", userErr)
        return NextResponse.json({ error: `DB error: ${userErr.message}` }, { status: 500 })
      }

      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

      if (user.is_premium) {
        return NextResponse.json({ error: "User is already verified" }, { status: 409 })
      }

      // Determine tier
      let tier: string
      if (requestedTier && ["genesis", "early", "standard"].includes(requestedTier)) {
        tier = requestedTier
      } else {
        const { data: counterData } = await supabase
          .from("verification_counter")
          .select("*")
          .eq("id", 1)
          .single()

        const totalVerified = counterData
          ? counterData.genesis_count + counterData.early_count + counterData.standard_count
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

        const { error: cErr } = await supabase.from("verification_counter").update(counterUpdate).eq("id", 1)
        if (cErr) console.error("Counter update error:", cErr)
      }

      // Update user — only fields that exist in the table
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 86400000)

      const { error: updateErr } = await supabase.from("users").update({
        is_premium: true,
        verification_tier: tier,
        onus_multiplier: multiplier,
        premium_expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      }).eq("telegram_id", telegramId)

      if (updateErr) {
        console.error("User update error:", updateErr)
        return NextResponse.json({ error: `User update failed: ${updateErr.message}` }, { status: 500 })
      }

      // Create subscription record (non-critical)
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
      }).catch((e: any) => console.error("Subscription insert error:", e))

      // Activation bonus (non-critical)
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
      const { error: rErr } = await supabase.from("users").update({
        is_premium: false,
        premium_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq("telegram_id", telegramId)

      if (rErr) {
        console.error("Revoke error:", rErr)
        return NextResponse.json({ error: `Revoke failed: ${rErr.message}` }, { status: 500 })
      }

      await supabase
        .from("premium_subscriptions")
        .update({ status: "cancelled" })
        .eq("telegram_id", telegramId)
        .eq("status", "active")
        .catch(() => {})

      return NextResponse.json({ success: true, message: "Premium revoked. Card tier preserved." })
    }

    // ── Legacy verify/unverify ──
    if (action === "verify_user") {
      await supabase.from("users")
        .update({ is_premium: true, updated_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "User verified" })
    }

    if (action === "unverify_user") {
      await supabase.from("users")
        .update({ is_premium: false, updated_at: new Date().toISOString() })
        .eq("telegram_id", telegramId)
      return NextResponse.json({ success: true, message: "Verification removed" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("Error managing user:", error)
    return NextResponse.json({ error: `Failed: ${error?.message || "Unknown error"}` }, { status: 500 })
  }
}
