import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"
import { CODE_ARTISTS, slugifyArtistName, type RosterEntry } from "@/lib/constants/roster-list"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const VALID_MOODS = ["moon", "rekt", "cope", "degen", "zen"]

interface ArtistBody {
  id?: string
  name?: string
  tagline?: string
  backstory?: string
  gender?: string
  moods?: string[]
  take_prompt?: string
  companion_bible?: string
  image?: string
  sort_order?: number
  is_active?: boolean
}

function cleanMoods(moods: unknown): string[] {
  if (!Array.isArray(moods)) return VALID_MOODS
  const kept = moods.filter((m): m is string => typeof m === "string" && VALID_MOODS.includes(m))
  return kept.length > 0 ? kept : VALID_MOODS
}

// ── GET: the merged roster, code first then DB ─────────────────
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const rl = await adminGeneralRatelimit().limit(`artists-get:${ip}`)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, tagline, backstory, gender, moods, take_prompt, companion_bible, image, sort_order, is_active, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const codeIds = new Set<string>(CODE_ARTISTS.map((a) => a.id))
    const merged: RosterEntry[] = [
      ...CODE_ARTISTS.map((a) => ({ id: a.id, name: a.name, source: "code" as const })),
      ...(data || [])
        .filter((r) => !codeIds.has(r.id))
        .map((r) => ({ id: r.id, name: r.name, source: "db" as const, tagline: r.tagline || "", is_active: r.is_active })),
    ]

    return NextResponse.json({ artists: merged, dbArtists: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

// ── POST: create a fresh artist ────────────────────────────────
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const rl = await adminGeneralRatelimit().limit(`artists-post:${ip}`)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = (await request.json()) as ArtistBody
    const name = (body.name || "").trim()
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json({ error: "Name is required (max 80 characters)" }, { status: 400 })
    }

    const id = slugifyArtistName(name)
    if (!id) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 })

    if (CODE_ARTISTS.some((a) => a.id === id || a.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "That artist already exists in the code roster" }, { status: 409 })
    }

    const supabase = await createAdminClient()
    const { error } = await supabase.from("artists").insert({
      id,
      name,
      tagline: (body.tagline || "").trim(),
      backstory: (body.backstory || "").trim(),
      gender: (body.gender || "").trim() || null,
      moods: cleanMoods(body.moods),
      take_prompt: (body.take_prompt || "").trim(),
      companion_bible: (body.companion_bible || "").trim(),
      image: (body.image || "").trim() || null,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
    })

    if (error) {
      const friendly = error.message.includes("artists_name_unique") || error.code === "23505"
        ? "An artist with that name already exists"
        : error.message
      return NextResponse.json({ error: friendly }, { status: 409 })
    }

    await logAdminAction(supabase, request, session.username, "artists.create", { id, name })

    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

// ── PATCH: edit or toggle a DB artist ──────────────────────────
export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const rl = await adminGeneralRatelimit().limit(`artists-patch:${ip}`)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = (await request.json()) as ArtistBody
    const id = (body.id || "").trim()
    if (!id) return NextResponse.json({ error: "Artist id is required" }, { status: 400 })

    // Code-roster artists are editable too: the row upserted under their id
    // is an OVERRIDE — the app shows a non-empty field instead of the code
    // version. Name and id stay locked to code; the row is always active so
    // a code artist can never be hidden from here.
    const codeArtist = CODE_ARTISTS.find((a) => a.id === id)
    if (codeArtist) {
      const supabase = await createAdminClient()
      const { error } = await supabase.from("artists").upsert(
        {
          id,
          name: codeArtist.name,
          tagline: typeof body.tagline === "string" ? body.tagline.trim() : "",
          backstory: typeof body.backstory === "string" ? body.backstory.trim() : "",
          gender: typeof body.gender === "string" ? body.gender.trim() || null : null,
          image: typeof body.image === "string" ? body.image.trim() || null : null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "artists.override", { id })
      return NextResponse.json({ ok: true, override: true })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.name === "string") {
      const name = body.name.trim()
      if (name.length < 1 || name.length > 80) {
        return NextResponse.json({ error: "Name is required (max 80 characters)" }, { status: 400 })
      }
      update.name = name
    }
    if (typeof body.tagline === "string") update.tagline = body.tagline.trim()
    if (typeof body.backstory === "string") update.backstory = body.backstory.trim()
    if (typeof body.gender === "string") update.gender = body.gender.trim() || null
    if (body.moods !== undefined) update.moods = cleanMoods(body.moods)
    if (typeof body.take_prompt === "string") update.take_prompt = body.take_prompt.trim()
    if (typeof body.companion_bible === "string") update.companion_bible = body.companion_bible.trim()
    if (typeof body.image === "string") update.image = body.image.trim() || null
    if (body.sort_order !== undefined && Number.isFinite(body.sort_order)) update.sort_order = Number(body.sort_order)
    if (typeof body.is_active === "boolean") update.is_active = body.is_active

    const supabase = await createAdminClient()
    const { data, error } = await supabase.from("artists").update(update).eq("id", id).select("id").maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "No such artist" }, { status: 404 })

    await logAdminAction(supabase, request, session.username, "artists.update", { id, fields: Object.keys(update) })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
