import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CONFIG_KEY = "pit_config"
const MAX_PACKS = 12

/**
 * Ammo packs + the money split, both stored in pit_config so nothing is
 * hardcoded. Packs drive the buy screen (price + Ammo, fully editable).
 * treasury_pct is the share of every dollar taken that goes into the
 * weekly payout pool; the house keeps the rest. Admin only.
 *
 * Shape in pit_config:
 *   ammo_packs:   [{ id, price_usd, ammo, active, label }]
 *   treasury_pct: number (0..100), default 70
 */

type Pack = { id: string; price_usd: number; ammo: number; active: boolean; label?: string }

function readCfg(value: string | null | undefined): Record<string, any> {
  if (!value) return {}
  try { return JSON.parse(value) } catch { return {} }
}

function cleanPacks(input: any): Pack[] {
  if (!Array.isArray(input)) return []
  const out: Pack[] = []
  for (const p of input.slice(0, MAX_PACKS)) {
    const price = Number(p?.price_usd)
    const ammo = Math.round(Number(p?.ammo))
    if (!Number.isFinite(price) || price <= 0) continue
    if (!Number.isFinite(ammo) || ammo <= 0) continue
    out.push({
      id: String(p?.id || `pack_${Math.random().toString(36).slice(2, 8)}`),
      price_usd: Math.round(price * 100) / 100,
      ammo,
      active: p?.active !== false,
      label: p?.label ? String(p.label).slice(0, 40) : undefined,
    })
  }
  return out
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
    const treasuryPct = Number.isFinite(Number(cfg.treasury_pct)) ? Number(cfg.treasury_pct) : 70

    return NextResponse.json({ packs, treasuryPct, housePct: 100 - treasuryPct })
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
    const before = { packs: cfg.ammo_packs ?? null, treasury_pct: cfg.treasury_pct ?? null }

    if (body.packs !== undefined) cfg.ammo_packs = cleanPacks(body.packs)

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
      before, after: { packs: cfg.ammo_packs, treasury_pct: cfg.treasury_pct },
    })

    const treasuryPct = Number.isFinite(Number(cfg.treasury_pct)) ? Number(cfg.treasury_pct) : 70
    return NextResponse.json({
      success: true,
      packs: cfg.ammo_packs || [],
      treasuryPct,
      housePct: 100 - treasuryPct,
    })
  } catch (error) {
    console.error("[admin/ammo/config] POST error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
