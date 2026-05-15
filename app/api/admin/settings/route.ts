import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Admin app_settings facade.
 *
 * GET  → returns the current values of every allowlisted key
 * PATCH → updates one or more allowlisted keys
 *
 * Only the subscription-related keys are exposed here. Other settings
 * have their own admin surfaces. The allowlist is the security boundary:
 * an admin can't accidentally edit something they don't realize is
 * here (or that doesn't belong here).
 */
const ALLOWED_KEYS = new Set([
  // Legacy subscription keys — kept for backwards compatibility
  "subscription_price_monthly_usd",
  "subscription_price_yearly_usd",
  "subscription_treasury_wallet",
  "genesis_window_closes_at",
  "sol_usd_price_source",
  "sol_usd_manual_pin",
  "yearly_subscriber_cp_bonus",
  "admin_test_mode",
  // Phase 3 — CP economy + Helius wallet-pay
  "genesis_window_starts_at",
  "genesis_window_duration_days",
  "helius_treasury_wallet",
  "helius_webhook_secret",
  "cp_pack_topup_cents",
  "cp_pack_bundle_cents",
  "cp_pack_whale_cents",
  "cp_pack_topup_amount",
  "cp_pack_bundle_amount",
  "cp_pack_whale_amount",
  "daily_free_cp_grant",
  "ledger_day_threshold",
])

function looksLikeSolanaAddress(s: string): boolean {
  if (typeof s !== "string") return false
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)
}

function validate(key: string, value: string): string | null {
  switch (key) {
    case "subscription_price_monthly_usd":
    case "subscription_price_yearly_usd":
    case "sol_usd_manual_pin":
    case "yearly_subscriber_cp_bonus": {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) return `${key} must be a non-negative number`
      return null
    }
    case "subscription_treasury_wallet": {
      if (value === "") return null // empty disables payments — explicitly allowed
      return looksLikeSolanaAddress(value)
        ? null
        : "subscription_treasury_wallet must be a valid Solana address (32-44 base58 chars)"
    }
    case "genesis_window_closes_at": {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return "genesis_window_closes_at must be a valid datetime"
      return null
    }
    case "sol_usd_price_source": {
      if (!["pyth", "coingecko", "manual_pin"].includes(value)) {
        return "sol_usd_price_source must be 'pyth', 'coingecko', or 'manual_pin'"
      }
      return null
    }
    case "admin_test_mode": {
      if (!["true", "false"].includes(value)) {
        return "admin_test_mode must be 'true' or 'false'"
      }
      return null
    }
    // ── Phase 3 — CP economy + Helius ─────────────────────────────────
    case "genesis_window_starts_at": {
      if (value === "") return null
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return "genesis_window_starts_at must be a valid datetime or empty"
      return null
    }
    case "genesis_window_duration_days":
    case "cp_pack_topup_cents":
    case "cp_pack_bundle_cents":
    case "cp_pack_whale_cents":
    case "cp_pack_topup_amount":
    case "cp_pack_bundle_amount":
    case "cp_pack_whale_amount":
    case "daily_free_cp_grant":
    case "ledger_day_threshold": {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 0) return `${key} must be a non-negative integer`
      return null
    }
    case "helius_treasury_wallet": {
      if (value === "") return null
      return looksLikeSolanaAddress(value)
        ? null
        : "helius_treasury_wallet must be a valid Solana address (32-44 base58 chars)"
    }
    case "helius_webhook_secret": {
      if (value === "") return null
      if (value.length < 16) return "helius_webhook_secret must be at least 16 chars"
      return null
    }
    default:
      return `Key ${key} is not allowed`
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", Array.from(ALLOWED_KEYS))
    if (error) throw error

    const out: Record<string, string> = {}
    for (const r of data ?? []) out[r.key] = r.value ?? ""

    // Fill any unset keys with empty string so the UI doesn't trip over null
    for (const k of Array.from(ALLOWED_KEYS)) if (!(k in out)) out[k] = ""

    return NextResponse.json({ settings: out })
  } catch (err) {
    console.error("[admin/settings GET]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const updates: Record<string, string> = body.updates || {}
  const keys = Object.keys(updates)
  if (keys.length === 0) {
    return NextResponse.json({ error: "No updates supplied" }, { status: 400 })
  }

  // Validate every update first — refuse the whole batch if anything fails
  for (const k of keys) {
    if (!ALLOWED_KEYS.has(k)) {
      return NextResponse.json({ error: `Key not allowed: ${k}` }, { status: 400 })
    }
    const v = String(updates[k] ?? "")
    const err = validate(k, v)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  try {
    const supabase = await createAdminClient()

    // Read current values for audit log
    const { data: before } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", keys)
    const beforeMap: Record<string, string> = {}
    for (const r of before ?? []) beforeMap[r.key] = r.value ?? ""

    // Upsert each row
    const rows = keys.map((k) => ({ key: k, value: String(updates[k] ?? "") }))
    const { error: upErr } = await supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" })
    if (upErr) throw upErr

    await logAdminAction(supabase, request, session.username, "app_settings.update", {
      keys,
      before: beforeMap,
      after: updates,
    })

    return NextResponse.json({ ok: true, updated: keys })
  } catch (err) {
    console.error("[admin/settings PATCH]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    )
  }
}
