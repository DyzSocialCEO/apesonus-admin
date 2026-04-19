import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"
import { adminGeneralRatelimit, getClientIp } from "@/lib/upstash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ── Artist roster ────────────────────────────────────────────────
// Keep in sync with lib/constants/artists.ts in the main app and the
// ARTISTS constant in app/dashboard/tracks/page.tsx.
const ARTISTS = [
  { id: "chartnobyl-bro",    name: "Chartnobyl Bro"    },
  { id: "coinalisa",         name: "Coinalisa"          },
  { id: "dj-dustwallet",     name: "DJ Dustwallet"      },
  { id: "lola-likwidity",    name: "Lola Likwidity"     },
  { id: "mcbagholder",       name: "McBagholder"        },
  { id: "shilliam-dafoe",    name: "Shilliam Dafoe"     },
  { id: "satosheek",         name: "Satosheek"          },
]

// Returns the primary artist name from "McBagholder ft. Some Guy".
// Mirrors getPrimaryArtist() in app/dashboard/tracks/page.tsx and the
// split logic in lib/constants/artists.ts so matching behaviour is
// consistent across the codebase.
function getPrimaryArtist(artistStr: string): string {
  return artistStr.split(/\s+ft\.?\s+|\s+feat\.?\s+/i)[0].trim()
}

// Images CDN hostname. Kept local to this module instead of a shared
// constant because the admin tracks-page uses the same literal and
// we want changes to be explicit and co-located with the route that
// writes to the DB. If this ever moves to a shared location, update
// both this route and app/dashboard/tracks/page.tsx together.
const IMAGE_CDN = "https://apesonus-images.b-cdn.net"

// Expand a short path like "/images-rekterapy/foo.png" to its full
// CDN URL. The main app reads the DB cover column as-is with no
// expansion, so we must store the full URL here. Mirrors the logic
// in app/dashboard/tracks/page.tsx (expandImageUrl) so paste flows
// behave identically between the two admin surfaces.
function expandImageUrl(input: string): string {
  if (!input) return ""
  if (input.startsWith("http")) return input
  return IMAGE_CDN + (input.startsWith("/") ? "" : "/") + input
}

// ── GET: return per-artist summary of current cover paths ──────
// For each of the 7 artists, report:
//   - tracks total
//   - tracks grouped by distinct cover URL
//   - the "dominant" cover URL (the one used by the most tracks)
// The dashboard renders this as a card grid.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const rl = await adminGeneralRatelimit().limit(`artist-covers-get:${ip}`)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const supabase = await createAdminClient()
    const { data: tracks, error } = await supabase
      .from("tracks")
      .select("id, artist, cover")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const summary = ARTISTS.map(a => {
      const nameLower = a.name.toLowerCase()
      const matching = (tracks || []).filter(t => {
        const primary = getPrimaryArtist(t.artist || "").toLowerCase()
        return primary === nameLower
      })

      // Group by cover URL, count occurrences. The most common one is
      // the "dominant" cover and what we show as the default in the UI.
      const counts = new Map<string, number>()
      for (const t of matching) {
        const c = (t.cover || "").trim()
        counts.set(c, (counts.get(c) || 0) + 1)
      }
      let dominant = ""
      let dominantCount = 0
      // Array.from sidesteps the Map iterator, which the admin repo's
      // tsconfig does not allow iterating directly without the
      // downlevelIteration flag. Behaviour is identical.
      Array.from(counts.entries()).forEach(([cover, count]) => {
        if (count > dominantCount) {
          dominantCount = count
          dominant = cover
        }
      })

      // Flag "mixed" state when tracks don't agree on a single cover.
      // Admin should see this and knows applying the bulk update will
      // unify them.
      const mixed = counts.size > 1
      const distinctCovers = Array.from(counts.keys()).filter(Boolean)

      return {
        id: a.id,
        name: a.name,
        trackCount: matching.length,
        dominantCover: dominant,
        mixed,
        distinctCovers,
      }
    })

    return NextResponse.json({ artists: summary })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load" }, { status: 500 })
  }
}

// ── POST: bulk-update cover for all tracks under one primary artist ──
// Body: { artistName: string, coverPath: string }
// - artistName must match one of the 7 roster names exactly
// - coverPath is stored raw. The tracks page's expandImageUrl() in the
//   main app handles CDN prefixing the same way it does for manual
//   edits, so passing a short path like "/images-rekterapy/foo.png"
//   or a full URL both work. This mirrors existing behaviour; we
//   don't enforce a format to avoid breaking your current paste flow.
// - Matches tracks where the PRIMARY artist (before "ft.") equals
//   artistName, case-insensitive. A track whose primary is
//   "McBagholder ft. Satosheek" will be updated for McBagholder
//   but NOT for Satosheek. That's intentional. Featured-on tracks
//   visually belong to the lead artist.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ip = getClientIp(request)
    const rl = await adminGeneralRatelimit().limit(`artist-covers-post:${ip}`)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const artistName = typeof body.artistName === "string" ? body.artistName.trim() : ""
    const coverPath = typeof body.coverPath === "string" ? body.coverPath.trim() : ""
    if (!artistName) return NextResponse.json({ error: "artistName required" }, { status: 400 })
    if (!coverPath) return NextResponse.json({ error: "coverPath required" }, { status: 400 })
    if (coverPath.length > 500) {
      return NextResponse.json({ error: "coverPath too long" }, { status: 400 })
    }

    // Whitelist: artistName must be one of the roster names.
    // Prevents arbitrary string injection into the DB query.
    const known = ARTISTS.find(a => a.name.toLowerCase() === artistName.toLowerCase())
    if (!known) return NextResponse.json({ error: "Unknown artist" }, { status: 400 })

    const supabase = await createAdminClient()

    // Read first so we know exactly which IDs are about to change and
    // can audit-log them. Also filters out featured-on matches on our
    // side using the same split logic the main app uses, so we don't
    // trust "artist ilike %name%" which would over-match.
    const { data: candidates, error: readErr } = await supabase
      .from("tracks")
      .select("id, artist, cover")
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })

    const nameLower = known.name.toLowerCase()
    const targetIds: number[] = []
    for (const t of candidates || []) {
      const primary = getPrimaryArtist(t.artist || "").toLowerCase()
      if (primary === nameLower) targetIds.push(t.id)
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        updatedCount: 0,
        message: `No tracks found for ${known.name}`,
      })
    }

    // Expand short paths to full CDN URLs before writing. The DB
    // invariant is that `cover` always holds a fully-qualified URL.
    // The main app reads this column as-is with no expansion helper.
    const finalCoverUrl = expandImageUrl(coverPath)

    const { error: writeErr } = await supabase
      .from("tracks")
      .update({ cover: finalCoverUrl })
      .in("id", targetIds)
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

    // Best-effort audit. Captures actor, target artist, target row
    // count, new cover path. Supplies enough to reverse manually if
    // something goes wrong.
    await logAdminAction(
      supabase,
      request,
      session.username,
      "artist_covers.bulk_update",
      {
        artist: known.name,
        coverPath: finalCoverUrl,
        trackIds: targetIds,
        updatedCount: targetIds.length,
      },
    )

    return NextResponse.json({
      updatedCount: targetIds.length,
      trackIds: targetIds,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update" }, { status: 500 })
  }
}
