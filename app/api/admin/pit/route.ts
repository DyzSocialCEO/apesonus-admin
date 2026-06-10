import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/pit
//
// Read-only inspector for THE PIT's Node Power layer.
//   - factions: total NP held, active scouts, and lifetime-stream difficulty
//     for each of the seven roster artists, ranked.
//   - totals: NP in play and qualified-play count.
//   - ?user=<id | name | email>: that player's Ammo and every node they hold,
//     with live decay state.
//
// Auth: admin session (same as every other admin route). Reads only.
// ═══════════════════════════════════════════════════════════════════════════

const ROSTER: Record<string, string> = {
  "chartnobyl-bro": "Chartnobyl Bro",
  "coinalisa":      "Coinalisa",
  "lola-likwidity": "Lola Likwidity",
  "mcbagholder":    "McBagholder",
  "dj-dustwallet":  "DJ Dustwallet",
  "shilliam-dafoe": "Shilliam Dafoe",
  "satosheek":      "Satosheek",
}
const GRACE_H = 24
const BLEED_H = 24
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function decayState(lastPlayAt: string | null): { state: string; detail: number } {
  if (!lastPlayAt) return { state: "grace", detail: GRACE_H }
  const h = (Date.now() - new Date(lastPlayAt).getTime()) / 3.6e6
  if (h < GRACE_H) return { state: "grace", detail: GRACE_H - h }
  if (h < GRACE_H + BLEED_H) return { state: "bleeding", detail: 1 - (h - GRACE_H) / BLEED_H }
  return { state: "dead", detail: 0 }
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()

    // ── Faction standings ──
    const { data: nodeAgg } = await supabase.from("pit_nodes").select("artist_id, np")
    const totals: Record<string, number> = {}
    const players: Record<string, number> = {}
    for (const r of nodeAgg || []) {
      const np = Number(r.np || 0)
      totals[r.artist_id] = (totals[r.artist_id] || 0) + np
      if (np > 0) players[r.artist_id] = (players[r.artist_id] || 0) + 1
    }

    const { data: stats } = await supabase.from("pit_artist_stats").select("artist_id, lifetime_streams")
    const streams: Record<string, number> = {}
    for (const s of stats || []) streams[s.artist_id] = Number(s.lifetime_streams || 0)

    const ids = new Set<string>([...Object.keys(ROSTER), ...Object.keys(totals), ...Object.keys(streams)])
    const factions = [...ids]
      .map((id) => ({
        artist_id: id,
        name: ROSTER[id] || id,
        total_np: totals[id] || 0,
        players: players[id] || 0,
        lifetime_streams: streams[id] || 0,
      }))
      .sort((a, b) => b.total_np - a.total_np)

    const totalNp = Object.values(totals).reduce((a, b) => a + b, 0)
    const { count: qpCount } = await supabase
      .from("pit_qualified_plays").select("id", { count: "exact", head: true })

    // ── Optional per-user lookup ──
    const url = new URL(request.url)
    const userQ = (url.searchParams.get("user") || "").trim()
    let userBlock: any = null

    if (userQ) {
      let uid: string | null = null
      if (UUID_RE.test(userQ)) {
        uid = userQ
      } else {
        const { data: byName } = await supabase
          .from("users").select("id").ilike("display_name", `%${userQ}%`).limit(1)
        if (byName && byName[0]) uid = byName[0].id
        if (!uid) {
          const { data: byEmail } = await supabase
            .from("users").select("id").ilike("email", `%${userQ}%`).limit(1)
          if (byEmail && byEmail[0]) uid = byEmail[0].id
        }
      }

      if (!uid) {
        userBlock = { query: userQ, found: false }
      } else {
        const { data: bal } = await supabase
          .from("pit_ammo_balances").select("balance").eq("user_id", uid).maybeSingle()
        const { data: nodes } = await supabase
          .from("pit_nodes").select("artist_id, np, last_play_at, grace_anchor_np").eq("user_id", uid)
        const userNodes = (nodes || [])
          .map((n: any) => {
            const d = decayState(n.last_play_at)
            return {
              artist_id: n.artist_id,
              name: ROSTER[n.artist_id] || n.artist_id,
              np: Number(n.np),
              last_play_at: n.last_play_at,
              state: d.state,
              detail: d.detail,
            }
          })
          .sort((a: any, b: any) => b.np - a.np)
        userBlock = { query: userQ, found: true, user_id: uid, ammo: Number(bal?.balance ?? 0), nodes: userNodes }
      }
    }

    return NextResponse.json({
      factions,
      totals: { total_np: totalNp, qualified_plays: qpCount || 0 },
      user: userBlock,
    })
  } catch (e) {
    console.error("[admin/pit] unexpected:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
