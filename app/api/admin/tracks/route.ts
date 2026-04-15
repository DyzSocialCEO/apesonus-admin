import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { signBunnyCdnUrl } from "@/lib/bunny-cdn"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ── Auto-detect m4a duration server-side ──
async function detectDuration(audioUrl: string): Promise<number> {
  try {
    const signed = signBunnyCdnUrl(audioUrl)

    // Try first 64KB (faststart files have moov at beginning)
    let buf = await fetchRange(signed, 0, 65535)
    let dur = parseMoov(buf)
    if (dur !== null) return Math.round(dur)

    // Try last 128KB (non-faststart files)
    const head = await fetch(signed, { method: "HEAD" })
    const len = parseInt(head.headers.get("content-length") || "0")
    if (len > 65536) {
      buf = await fetchRange(signed, Math.max(0, len - 131072), len - 1)
      dur = parseMoov(buf)
      if (dur !== null) return Math.round(dur)
    }

    // Fallback: full file if < 20MB
    if (len > 0 && len < 20 * 1024 * 1024) {
      const r = await fetch(signed)
      buf = new Uint8Array(await r.arrayBuffer())
      dur = parseMoov(buf)
      if (dur !== null) return Math.round(dur)
    }
  } catch (e) {
    console.warn("[Duration] detect failed:", e)
  }
  return 0
}

async function fetchRange(url: string, s: number, e: number) {
  const r = await fetch(url, { headers: { Range: `bytes=${s}-${e}` } })
  return new Uint8Array(await r.arrayBuffer())
}

function parseMoov(d: Uint8Array): number | null {
  const moov = findAtom(d, "moov", 0)
  if (moov === -1) return null
  const mvhd = findAtom(d, "mvhd", moov + 8)
  if (mvhd === -1) return null
  const h = mvhd + 8
  if (h + 4 > d.length) return null
  const v = d[h]
  if (v === 0) {
    const o = h + 4; if (o + 16 > d.length) return null
    const ts = r32(d, o + 8), du = r32(d, o + 12)
    return ts ? du / ts : null
  }
  if (v === 1) {
    const o = h + 4; if (o + 28 > d.length) return null
    const ts = r32(d, o + 16)
    const du = r32(d, o + 20) * 0x100000000 + r32(d, o + 24)
    return ts ? du / ts : null
  }
  return null
}

function findAtom(d: Uint8Array, n: string, s: number): number {
  let o = s
  const c = [n.charCodeAt(0), n.charCodeAt(1), n.charCodeAt(2), n.charCodeAt(3)]
  while (o + 8 <= d.length) {
    const sz = r32(d, o)
    if (d[o+4]===c[0] && d[o+5]===c[1] && d[o+6]===c[2] && d[o+7]===c[3]) return o
    if (sz === 0) break
    if (sz === 1) { if (o+16>d.length) break; o += r32(d,o+8)*0x100000000+r32(d,o+12) }
    else o += sz
  }
  return -1
}

function r32(d: Uint8Array, o: number) {
  return ((d[o]<<24)>>>0)+(d[o+1]<<16)+(d[o+2]<<8)+d[o+3]
}

// ── Routes ──

// GET all tracks
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data: tracks, error } = await supabase
      .from("tracks")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) throw error
    return NextResponse.json({ tracks: tracks || [] })
  } catch (error) {
    console.error("Error fetching tracks:", error)
    return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 })
  }
}

// POST - create new track
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const supabase = await createAdminClient()

    // Auto-detect duration if not provided
    let duration = body.duration || 0
    if (duration === 0 && body.audio) {
      duration = await detectDuration(body.audio)
    }

    const { data, error } = await supabase
      .from("tracks")
      .insert({
        title: body.title,
        artist: body.artist,
        mood: body.mood,
        cover: body.cover,
        audio: body.audio,
        duration,
        is_instrumental: body.is_instrumental || false,
        soundbath_category: body.soundbath_category || null,
        is_active: body.is_active !== false,
        is_featured: body.is_featured || false,
        is_editors_choice: body.is_editors_choice || false,
        sort_order: body.sort_order || 0,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ track: data })
  } catch (error) {
    console.error("Error creating track:", error)
    return NextResponse.json({ error: "Failed to create track" }, { status: 500 })
  }
}

// PUT - update track
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    // Auto-detect duration if updating audio URL with no duration
    if (updates.audio && (!updates.duration || updates.duration === 0)) {
      updates.duration = await detectDuration(updates.audio)
    }

    const supabase = await createAdminClient()

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("tracks")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ track: data })
  } catch (error) {
    console.error("Error updating track:", error)
    return NextResponse.json({ error: "Failed to update track" }, { status: 500 })
  }
}

// DELETE - remove track
export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    const trackId = parseInt(id)
    const supabase = await createAdminClient()

    // Clean up FK references before deleting track
    await supabase.from("favorites").delete().eq("track_id", trackId)
    await supabase.from("play_history").delete().eq("track_id", trackId)
    await supabase.from("unique_listens").delete().eq("track_id", trackId)

    const { error } = await supabase.from("tracks").delete().eq("id", trackId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete track" }, { status: 500 })
  }
}
