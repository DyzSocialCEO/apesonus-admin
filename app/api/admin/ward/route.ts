import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE WARD desk.
 *
 * GET   the staff with every prescription (locked ones included, this is the
 *       desk), the census, the track list, the Spin packs and settings, the
 *       clip
 * PATCH the buy link, the packs and the Spin numbers
 * POST  everything else, by `what`: the clip, a therapist, a prescription,
 *       the featured switch, an unlock
 *
 * Everything the app shows about the staff, the targets and the prices is
 * read from here, so none of it is written into the player's code.
 */

interface Pack {
  key: string
  name: string
  cents: number
  spins: number
  bonus: number
  line: string
  best: boolean
}

const PACK_FALLBACK: Pack[] = [
  { key: "quick", name: "QUICK FIX", cents: 100, spins: 100, bonus: 0, line: "One dollar. One hundred treatments.", best: false },
]

interface WardConfig {
  buy_url: string
  packs: Pack[]
  /** What one treatment session costs. */
  spins_per_play: number
  /** Handed to an account the first time the clinic sees it. */
  starter_spins: number
  /** How much of a track has to play before it becomes a Dose. */
  dose_pct: number
  /** Doses between refills, and what a refill pays. */
  refill_every: number
  refill_spins: number
}

function toPacks(raw: unknown): Pack[] {
  if (!Array.isArray(raw)) return []
  const out: Pack[] = []
  for (const p of raw) {
    const v = (p ?? {}) as Record<string, unknown>
    const key = String(v.key || "").trim()
    const cents = Math.floor(Number(v.cents))
    const spins = Math.floor(Number(v.spins))
    if (!key || !Number.isFinite(cents) || cents < 1 || !Number.isFinite(spins) || spins < 1) continue
    const bonus = Math.floor(Number(v.bonus))
    out.push({
      key,
      name: String(v.name || key).trim() || key,
      cents,
      spins,
      bonus: Number.isFinite(bonus) && bonus > 0 ? bonus : 0,
      line: String(v.line || ""),
      best: v.best === true,
    })
  }
  return out
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function readConfig(raw: unknown): WardConfig {
  try {
    // app_settings.value can arrive as text OR as an already-parsed object if
    // the column is jsonb. Parsing String(object) yields "[object Object]",
    // which throws and silently drops the saved config.
    const v =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : JSON.parse(String(raw ?? "{}"))
    const packs = toPacks(v.packs)
    return {
      buy_url: String(v.buy_url || ""),
      packs: packs.length > 0 ? packs : PACK_FALLBACK,
      spins_per_play: num(v.spins_per_play, 1, 1, 100),
      starter_spins: num(v.starter_spins, 2, 0, 1000),
      dose_pct: num(v.dose_pct, 80, 10, 100),
      refill_every: num(v.refill_every, 25, 1, 100000),
      refill_spins: num(v.refill_spins, 5, 0, 10000),
    }
  } catch {
    return {
      buy_url: "",
      packs: PACK_FALLBACK,
      spins_per_play: 1,
      starter_spins: 2,
      dose_pct: 80,
      refill_every: 25,
      refill_spins: 5,
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const day = today()
    const [cfgRow, tracks, census, holders, therapists, rx, clip, mintRow] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "ward_config").maybeSingle(),
      supabase
        .from("tracks")
        .select("id, title, artist")
        .eq("is_active", true)
        .order("title", { ascending: true })
        .limit(500),
      supabase.from("ward_spin_state").select("user_id", { count: "exact", head: true }),
      supabase
        .from("pit_ammo_balances")
        .select("user_id", { count: "exact", head: true })
        .gt("balance", 0),
      supabase.from("ward_therapists").select("*").order("sort", { ascending: true }).order("id", { ascending: true }),
      supabase.from("ward_prescriptions").select("*").order("seq", { ascending: true }),
      supabase.from("ward_morning_dose").select("url, caption").eq("day", day).maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "onus_mint").maybeSingle(),
    ])

    const config = readConfig(cfgRow.data?.value)

    const rxRows = (rx.data ?? []) as any[]

    // Dose totals per track, counted BY THE DATABASE. Pulling every dose row
    // and counting them here worked until the ward passed a thousand doses,
    // because a response is capped at a thousand rows and every number on this
    // page then quietly stopped moving while the app stayed correct.
    const trackIds = Array.from(new Set(rxRows.map((r) => Number(r.track_id)).filter((n) => n > 0)))
    const perTrack = new Map<number, number>()
    await Promise.all(
      trackIds.map(async (id) => {
        const { count } = await supabase
          .from("ward_doses")
          .select("id", { count: "exact", head: true })
          .eq("track_id", id)
        perTrack.set(id, Number(count ?? 0))
      }),
    )
    const staff = ((therapists.data ?? []) as any[]).map((t) => {
      const own = rxRows.filter((r) => Number(r.therapist_id) === Number(t.id))
      return {
        id: Number(t.id),
        name: String(t.name || ""),
        bio: String(t.bio || ""),
        image: String(t.image || ""),
        sort: Number(t.sort ?? 100),
        featured: t.featured === true,
        active: t.active === true,
        doses: own.reduce((n, r) => n + (perTrack.get(Number(r.track_id)) ?? 0), 0),
        prescriptions: own.map((r) => ({
          id: Number(r.id),
          track_id: Number(r.track_id),
          seq: Number(r.seq),
          target: r.target == null ? null : Number(r.target),
          line: String(r.line || ""),
          unlocked: r.unlocked_at != null,
          doses: perTrack.get(Number(r.track_id)) ?? 0,
        })),
      }
    })

    return NextResponse.json({
      config,
      census: Number(census.count ?? 0),
      holders: Number(holders.count ?? 0),
      tracks: tracks.data ?? [],
      therapists: staff,
      day,
      morningDose: clip.data ? { url: String(clip.data.url), caption: clip.data.caption ?? "" } : null,
      mint: String(mintRow.data?.value ?? "").trim() || null,
    })
  } catch (e: any) {
    console.error("[admin/ward] GET failed:", e)
    return NextResponse.json({ error: "Could not read the ward." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: row } = await supabase
      .from("app_settings").select("value").eq("key", "ward_config").maybeSingle()
    const current = readConfig(row?.value)
    const next: WardConfig = { ...current }

    if ("buy_url" in body) {
      const url = String(body.buy_url || "").trim()
      if (url && !/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: "The buy link needs a full https address." }, { status: 400 })
      }
      next.buy_url = url
    }
    if ("packs" in body) {
      const packs = toPacks(body.packs)
      if (packs.length < 1) {
        return NextResponse.json({ error: "At least one pack with a key, a price and a Spin count is required." }, { status: 400 })
      }
      const keys = new Set(packs.map((p) => p.key))
      if (keys.size !== packs.length) {
        return NextResponse.json({ error: "Pack keys must be unique." }, { status: 400 })
      }
      next.packs = packs
    }
    if ("spins_per_play" in body) next.spins_per_play = num(body.spins_per_play, next.spins_per_play, 1, 100)
    if ("starter_spins" in body) next.starter_spins = num(body.starter_spins, next.starter_spins, 0, 1000)
    if ("dose_pct" in body) next.dose_pct = num(body.dose_pct, next.dose_pct, 10, 100)
    if ("refill_every" in body) next.refill_every = num(body.refill_every, next.refill_every, 1, 100000)
    if ("refill_spins" in body) next.refill_spins = num(body.refill_spins, next.refill_spins, 0, 10000)

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "ward_config", value: JSON.stringify(next) }, { onConflict: "key" })
    if (error) throw error

    await logAdminAction(supabase, request, session.username, "ward.update", { before: current, after: next })

    return NextResponse.json({ config: next, saved: true })
  } catch (e: any) {
    console.error("[admin/ward] PATCH failed:", e)
    return NextResponse.json({ error: "Could not save the ward." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    // ── Today's clip. One row per day; writing again replaces the day. ──
    if (body.what === "clip") {
      const day = today()
      const url = String(body.url || "").trim()
      const caption = String(body.caption || "").trim()
      if (!url) {
        const { error } = await supabase.from("ward_morning_dose").delete().eq("day", day)
        if (error) throw error
        await logAdminAction(supabase, request, session.username, "ward.clip", { day, cleared: true })
        return NextResponse.json({ saved: true, morningDose: null })
      }
      if (!/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: "The clip needs a full https link." }, { status: 400 })
      }
      const { error } = await supabase
        .from("ward_morning_dose")
        .upsert({ day, url, caption: caption || null, updated_at: new Date().toISOString() }, { onConflict: "day" })
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.clip", { day, url })
      return NextResponse.json({ saved: true, morningDose: { url, caption } })
    }

    // ── A therapist. No id = a new hire. ──
    if (body.what === "therapist_save") {
      const name = String(body.name || "").trim()
      if (!name) return NextResponse.json({ error: "A therapist needs a name." }, { status: 400 })
      const image = String(body.image || "").trim()
      if (image && !/^(https:\/\/|\/)/i.test(image)) {
        return NextResponse.json({ error: "The image needs a full https link or a /path." }, { status: 400 })
      }
      const sortN = Math.floor(Number(body.sort))
      const rowData = {
        name,
        bio: String(body.bio || "").trim(),
        image,
        sort: Number.isFinite(sortN) ? sortN : 100,
      }
      const id = Number(body.id)
      if (Number.isFinite(id) && id > 0) {
        const { error } = await supabase.from("ward_therapists").update(rowData).eq("id", id)
        if (error) throw error
        await logAdminAction(supabase, request, session.username, "ward.therapist", { id, ...rowData })
        return NextResponse.json({ saved: true })
      }
      const { data, error } = await supabase.from("ward_therapists").insert(rowData).select("id").single()
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.therapist", { created: data?.id, ...rowData })
      return NextResponse.json({ saved: true, id: data?.id })
    }

    // ── The instant switches. Each one saves the moment it is pressed. ──
    if (body.what === "therapist_active") {
      const id = Number(body.id)
      if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "id required" }, { status: 400 })
      const active = body.active === true
      const { error } = await supabase.from("ward_therapists").update({ active }).eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.therapist.active", { id, active })
      return NextResponse.json({ saved: true })
    }

    if (body.what === "therapist_feature") {
      const id = Number(body.id)
      if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "id required" }, { status: 400 })
      // Exactly one featured therapist, ever. Clearing first means two can
      // never lead the ward at once, same rule as the pinned confession.
      const { error: clearErr } = await supabase.from("ward_therapists").update({ featured: false }).eq("featured", true)
      if (clearErr) throw clearErr
      const { error } = await supabase.from("ward_therapists").update({ featured: true, active: true }).eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.therapist.feature", { id })
      return NextResponse.json({ saved: true })
    }

    if (body.what === "therapist_delete") {
      const id = Number(body.id)
      if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "id required" }, { status: 400 })
      const { error } = await supabase.from("ward_therapists").delete().eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.therapist.delete", { id })
      return NextResponse.json({ saved: true })
    }

    // ── A prescription. seq 1 is born unlocked; later ones need a target. ──
    if (body.what === "rx_save") {
      const id = Number(body.id)
      const therapistId = Number(body.therapist_id)
      const trackId = Number(body.track_id)
      const seq = Math.floor(Number(body.seq))
      const line = String(body.line || "").trim()
      const targetRaw = body.target
      const target =
        targetRaw == null || String(targetRaw).trim() === "" ? null : Math.floor(Number(targetRaw))

      if (!Number.isFinite(therapistId) || therapistId < 1)
        return NextResponse.json({ error: "therapist required" }, { status: 400 })
      if (!Number.isFinite(trackId) || trackId < 1)
        return NextResponse.json({ error: "Pick a track." }, { status: 400 })
      if (!Number.isFinite(seq) || seq < 1)
        return NextResponse.json({ error: "seq must be 1 or higher." }, { status: 400 })
      if (seq > 1 && (target == null || !Number.isFinite(target) || target < 1))
        return NextResponse.json({ error: "A prescription after the first needs a dose target." }, { status: 400 })

      const { data: track } = await supabase.from("tracks").select("id").eq("id", trackId).maybeSingle()
      if (!track) return NextResponse.json({ error: "That track does not exist." }, { status: 400 })

      if (Number.isFinite(id) && id > 0) {
        const { error } = await supabase
          .from("ward_prescriptions")
          .update({ track_id: trackId, seq, target, line })
          .eq("id", id)
        if (error) throw error
        await logAdminAction(supabase, request, session.username, "ward.rx", { id, trackId, seq, target })
        return NextResponse.json({ saved: true })
      }
      const { data, error } = await supabase
        .from("ward_prescriptions")
        .insert({
          therapist_id: therapistId,
          track_id: trackId,
          seq,
          target,
          line,
          // The first prescription is on the ward the moment it exists.
          unlocked_at: seq === 1 ? new Date().toISOString() : null,
        })
        .select("id")
        .single()
      if (error) {
        const msg = String(error.message || "")
        if (msg.includes("ward_prescriptions_track_id_key"))
          return NextResponse.json({ error: "That track is already someone's prescription." }, { status: 400 })
        if (msg.includes("ward_prescriptions_therapist_id_seq_key"))
          return NextResponse.json({ error: "That therapist already has that prescription number." }, { status: 400 })
        throw error
      }
      await logAdminAction(supabase, request, session.username, "ward.rx", { created: data?.id, therapistId, trackId, seq, target })
      return NextResponse.json({ saved: true, id: data?.id })
    }

    if (body.what === "rx_unlock") {
      const id = Number(body.id)
      if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "id required" }, { status: 400 })
      const { error } = await supabase
        .from("ward_prescriptions")
        .update({ unlocked_at: new Date().toISOString() })
        .eq("id", id)
        .is("unlocked_at", null)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.rx.unlock", { id })
      return NextResponse.json({ saved: true })
    }

    if (body.what === "rx_delete") {
      const id = Number(body.id)
      if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "id required" }, { status: 400 })
      const { error } = await supabase.from("ward_prescriptions").delete().eq("id", id)
      if (error) throw error
      await logAdminAction(supabase, request, session.username, "ward.rx.delete", { id })
      return NextResponse.json({ saved: true })
    }

    // ── Handing Spins to an account by hand. ──
    // When a payment lands and something breaks, the fix has to be possible
    // from here rather than from a SQL editor at midnight. Every grant is
    // audited with the reason typed beside it.
    if (body.what === "grant_spins") {
      const email = String(body.email || "").trim().toLowerCase()
      const spins = Math.floor(Number(body.spins))
      const reason = String(body.reason || "").trim()
      if (!email) return NextResponse.json({ error: "Which account?" }, { status: 400 })
      if (!Number.isFinite(spins) || spins === 0) {
        return NextResponse.json({ error: "How many Spins?" }, { status: 400 })
      }
      if (!reason) return NextResponse.json({ error: "Say why. It goes in the log." }, { status: 400 })

      const { data: user } = await supabase
        .from("users")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle()
      if (!user?.id) return NextResponse.json({ error: "No account with that email." }, { status: 404 })

      const { data: row } = await supabase
        .from("pit_ammo_balances")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle()
      const before = Number(row?.balance ?? 0)
      const after = Math.max(0, before + spins)

      const { error } = await supabase
        .from("pit_ammo_balances")
        .upsert({ user_id: user.id, balance: after, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      if (error) throw error

      await logAdminAction(supabase, request, session.username, "ward.grant_spins", {
        email, spins, reason, before, after,
      })
      return NextResponse.json({ saved: true, before, after })
    }

    return NextResponse.json({ error: "Nothing to save." }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/ward] POST failed:", e)
    return NextResponse.json({ error: "Could not save." }, { status: 500 })
  }
}
