import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CONFIG_KEY = "pit_config"
const MAX_PACKS = 12
const MAX_TIERS = 8

/**
 * Ammo packs, the money split, and the discount ladder, all stored in
 * pit_config so nothing is hardcoded. Packs drive the buy screen
 * (whole-dollar price + Ammo, fully editable). treasury_pct is the share
 * of every dollar taken that goes into the weekly payout pool; the house
 * keeps the rest. discount_tiers give bonus Ammo by how much a player
 * spends in one go. Admin only.
 *
 * Shape in pit_config:
 *   ammo_packs:    [{ id, price_usd (int >= 1), ammo (int >= 1 | null), active, label }]
 *                  ammo null means "compute from the ladder"; a filled ammo
 *                  overrides the ladder for that pack.
 *   treasury_pct:  number (0..100), default 70
 *   spins_per_play: number (>= 1), default 1. What one play-through costs.
 *                  Read by pit_spend_for_play, so changing it here changes
 *                  the price of a song with no deploy.
 *   discount_tiers:[{ min_usd (int >= 1), bonus_pct (int 1..100) }] sorted by min_usd
 */

type Pack = { id: string; price_usd: number; ammo: number | null; active: boolean; label?: string }
type Tier = { min_usd: number; bonus_pct: number }

const isBlank = (v: any) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")

function readCfg(value: string | null | undefined): Record<string, any> {
  if (!value) return {}
  try { return JSON.parse(value) } catch { return {} }
}

// Whole-dollar price, no decimals/zero/blank. Ammo is optional: blank stores
// null (the ladder sets it), a filled value must be a whole number >= 1 and
// overrides the ladder. Fully empty rows are stripped, not flagged.
function validatePacks(input: any): { packs: Pack[]; errors: string[] } {
  const packs: Pack[] = []
  const errors: string[] = []
  if (!Array.isArray(input)) return { packs, errors }
  input.slice(0, MAX_PACKS).forEach((p, i) => {
    const n = i + 1
    const priceBlank = isBlank(p?.price_usd)
    const ammoBlank = isBlank(p?.ammo)
    if (priceBlank && ammoBlank) return // empty row, strip it
    const price = Number(p?.price_usd)
    if (priceBlank || !Number.isInteger(price) || price < 1) {
      errors.push(`Pack ${n}: price must be a whole dollar, 1 or more.`); return
    }
    let ammo: number | null = null
    if (!ammoBlank) {
      const a = Number(p?.ammo)
      if (!Number.isInteger(a) || a < 1) {
        errors.push(`Pack ${n}: Ammo must be a whole number 1 or more, or blank to use the ladder.`); return
      }
      ammo = a
    }
    packs.push({
      id: String(p?.id || `pack_${Math.random().toString(36).slice(2, 8)}`),
      price_usd: price,
      ammo,
      active: p?.active !== false,
      label: p?.label ? String(p.label).slice(0, 40) : undefined,
    })
  })
  return { packs, errors }
}

// Whole-number tiers only. Empty rows stripped, duplicate thresholds rejected,
// result sorted ascending by spend so the buy screen can read it top-down.
function validateTiers(input: any): { tiers: Tier[]; errors: string[] } {
  const tiers: Tier[] = []
  const errors: string[] = []
  if (!Array.isArray(input)) return { tiers, errors }
  const seen = new Set<number>()
  input.slice(0, MAX_TIERS).forEach((t, i) => {
    const n = i + 1
    const minBlank = isBlank(t?.min_usd)
    const bonusBlank = isBlank(t?.bonus_pct)
    if (minBlank && bonusBlank) return // empty row, strip it
    const min = Number(t?.min_usd)
    const bonus = Number(t?.bonus_pct)
    if (minBlank || !Number.isInteger(min) || min < 1) {
      errors.push(`Tier ${n}: spend threshold must be a whole dollar, 1 or more.`); return
    }
    if (bonusBlank || !Number.isInteger(bonus) || bonus < 1 || bonus > 100) {
      errors.push(`Tier ${n}: bonus must be a whole number between 1 and 100.`); return
    }
    if (seen.has(min)) {
      errors.push(`Tier ${n}: another tier already starts at $${min}.`); return
    }
    seen.add(min)
    tiers.push({ min_usd: min, bonus_pct: bonus })
  })
  tiers.sort((a, b) => a.min_usd - b.min_usd)
  return { tiers, errors }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data: cfgRow } = await supabase
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const cfg = readCfg(cfgRow?.value)

    const packs: Pack[] = Array.isArray(cfg.ammo_packs) ? cfg.ammo_packs : []
    const discountTiers: Tier[] = Array.isArray(cfg.discount_tiers) ? cfg.discount_tiers : []
    const treasuryPct = Number.isFinite(Number(cfg.treasury_pct)) ? Number(cfg.treasury_pct) : 70
    const spinsPerPlay = Number.isInteger(Number(cfg.spins_per_play)) && Number(cfg.spins_per_play) >= 1
      ? Number(cfg.spins_per_play)
      : 1

    return NextResponse.json({ packs, discountTiers, treasuryPct, housePct: 100 - treasuryPct, spinsPerPlay })
  } catch (error) {
    console.error("[admin/ammo/config] GET error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: cfgRow } = await supabase
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    if (!cfgRow?.value) {
      return NextResponse.json({ error: "pit_config missing — run pit_000_foundations first" }, { status: 500 })
    }
    const cfg = readCfg(cfgRow.value)
    const before = {
      packs: cfg.ammo_packs ?? null,
      treasury_pct: cfg.treasury_pct ?? null,
      discount_tiers: cfg.discount_tiers ?? null,
      spins_per_play: cfg.spins_per_play ?? null,
    }

    if (body.packs !== undefined) {
      const { packs, errors } = validatePacks(body.packs)
      if (errors.length) {
        return NextResponse.json({ error: "Some packs are invalid", details: errors }, { status: 400 })
      }
      cfg.ammo_packs = packs
    }

    if (body.discountTiers !== undefined) {
      const { tiers, errors } = validateTiers(body.discountTiers)
      if (errors.length) {
        return NextResponse.json({ error: "Some discount tiers are invalid", details: errors }, { status: 400 })
      }
      cfg.discount_tiers = tiers
    }

    if (body.spinsPerPlay !== undefined) {
      const n = Number(body.spinsPerPlay)
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        return NextResponse.json({ error: "Spins per play must be a whole number between 1 and 100" }, { status: 400 })
      }
      cfg.spins_per_play = n
    }

    if (body.treasuryPct !== undefined) {
      const t = Number(body.treasuryPct)
      if (!Number.isFinite(t) || t < 0 || t > 100) {
        return NextResponse.json({ error: "treasuryPct must be between 0 and 100" }, { status: 400 })
      }
      cfg.treasury_pct = Math.round(t * 100) / 100
    }

    const { error: updErr } = await supabase
      .from("app_settings")
      .update({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() })
      .eq("key", CONFIG_KEY)
    if (updErr) {
      console.error("[admin/ammo/config] update failed:", updErr)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    await logAdminAction(supabase, request, session.username || "unknown", "ammo.config.set", {
      before,
      after: { packs: cfg.ammo_packs, treasury_pct: cfg.treasury_pct, discount_tiers: cfg.discount_tiers, spins_per_play: cfg.spins_per_play },
    })

    const treasuryPct = Number.isFinite(Number(cfg.treasury_pct)) ? Number(cfg.treasury_pct) : 70
    return NextResponse.json({
      success: true,
      packs: cfg.ammo_packs || [],
      discountTiers: cfg.discount_tiers || [],
      treasuryPct,
      housePct: 100 - treasuryPct,
    })
  } catch (error) {
    console.error("[admin/ammo/config] POST error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
