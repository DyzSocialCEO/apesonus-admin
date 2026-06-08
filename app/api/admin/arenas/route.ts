import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ============================================================================
// /api/admin/arenas — create / list / open / settle / void / edit / delete
//
// Arenas are the Blind Backing Arena cycles. Writes go through the service-role
// client (createAdminClient), so RLS is bypassed.
//   settle -> opens the vaults: arena_settle reveals picks, names the winner,
//             returns every stake 100%, flags winners (jackpot pluggable).
//   void   -> arena_refund returns all locked stakes, then status -> void.
// ============================================================================

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()

    const { data: arenas } = await supabase
      .from("arenas").select("*").order("created_at", { ascending: false }).limit(200)

    const { data: arenaTracks } = await supabase
      .from("arena_tracks").select("arena_id, track_id")

    const { data: tracks } = await supabase
      .from("tracks").select("id, title, artist, mood").eq("is_active", true).order("title")

    const byArena: Record<string, number[]> = {}
    for (const at of arenaTracks || []) {
      (byArena[at.arena_id] ||= []).push(at.track_id)
    }

    return NextResponse.json({ arenas: arenas || [], arenaTracks: byArena, tracks: tracks || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createAdminClient()
    const body = await request.json()
    const action = body.action

    // -- create --
    if (action === "create") {
      const { title, genre, cycle_seconds, min_back, max_back, track_ids } = body
      if (!title || !cycle_seconds) {
        return NextResponse.json({ error: "missing fields (title, cycle_seconds)" }, { status: 400 })
      }
      const ids: number[] = Array.isArray(track_ids)
        ? track_ids.map((x: any) => Number(x)).filter((n: number) => !!n)
        : []
      if (ids.length < 2) {
        return NextResponse.json({ error: "pick at least 2 tracks for the arena" }, { status: 400 })
      }
      const minB = Number(min_back) || 0
      const maxB = max_back === "" || max_back == null ? null : Number(max_back)
      if (maxB != null && maxB < minB) {
        return NextResponse.json({ error: "max back cannot be below min back" }, { status: 400 })
      }

      const { data: arena, error } = await supabase.from("arenas").insert({
        title,
        genre: genre || "ALL",
        cycle_seconds: Number(cycle_seconds),
        min_back: minB,
        max_back: maxB,
        status: "draft",
        created_by: null,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const rows = ids.map((track_id) => ({ arena_id: arena.id, track_id }))
      const { error: tErr } = await supabase.from("arena_tracks").insert(rows)
      if (tErr) {
        await supabase.from("arenas").delete().eq("id", arena.id) // no orphan arena
        return NextResponse.json({ error: tErr.message }, { status: 500 })
      }
      return NextResponse.json({ created: true, arena })
    }

    const arenaId = body.arena_id
    if (!arenaId) return NextResponse.json({ error: "arena_id required" }, { status: 400 })

    // -- open -- (start the cycle: stamp opens_at + reveal_at, flip to open)
    if (action === "open") {
      const { data: a } = await supabase.from("arenas").select("status, cycle_seconds").eq("id", arenaId).single()
      if (!a) return NextResponse.json({ error: "arena not found" }, { status: 404 })
      if (a.status !== "draft") {
        return NextResponse.json({ error: "only a draft arena can be opened (is " + a.status + ")" }, { status: 400 })
      }
      const now = new Date()
      const reveal = new Date(now.getTime() + Number(a.cycle_seconds) * 1000)
      const { data, error } = await supabase.from("arenas").update({
        status: "open", opens_at: now.toISOString(), reveal_at: reveal.toISOString(),
      }).eq("id", arenaId).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ opened: true, arena: data })
    }

    // -- settle -- (open the vaults: reveal picks, name winner, return stakes)
    if (action === "settle") {
      const jackpot = Number(body.jackpot) || 0
      const { data, error } = await supabase.rpc("arena_settle", { p_arena_id: arenaId, p_jackpot: jackpot })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settled: true, result: data })
    }

    // -- void -- (refund every locked stake first, then mark void)
    if (action === "void") {
      const { error: rErr } = await supabase.rpc("arena_refund", { p_arena_id: arenaId })
      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
      const { data, error } = await supabase.from("arenas").update({ status: "void" }).eq("id", arenaId).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ voided: true, arena: data })
    }

    // -- edit -- (only while draft: fields + the track set)
    if (action === "edit") {
      const { data: a } = await supabase.from("arenas").select("status").eq("id", arenaId).single()
      if (!a) return NextResponse.json({ error: "arena not found" }, { status: 404 })
      if (a.status !== "draft") {
        return NextResponse.json({ error: "only a draft arena can be edited (is " + a.status + ")" }, { status: 400 })
      }
      const patch: Record<string, unknown> = {}
      if (body.title != null) patch.title = body.title
      if (body.genre != null) patch.genre = body.genre
      if (body.cycle_seconds != null) patch.cycle_seconds = Number(body.cycle_seconds)
      if (body.min_back != null) patch.min_back = Number(body.min_back) || 0
      if ("max_back" in body) patch.max_back = body.max_back === "" || body.max_back == null ? null : Number(body.max_back)
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("arenas").update(patch).eq("id", arenaId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (Array.isArray(body.track_ids)) {
        const ids: number[] = body.track_ids.map((x: any) => Number(x)).filter((n: number) => !!n)
        await supabase.from("arena_tracks").delete().eq("arena_id", arenaId)
        if (ids.length) {
          await supabase.from("arena_tracks").insert(ids.map((track_id) => ({ arena_id: arenaId, track_id })))
        }
      }
      return NextResponse.json({ edited: true })
    }

    // -- delete -- (block while open)
    if (action === "delete") {
      const { data: a } = await supabase.from("arenas").select("status").eq("id", arenaId).single()
      if (!a) return NextResponse.json({ error: "arena not found" }, { status: 404 })
      if (a.status === "open") {
        return NextResponse.json({ error: "open arena — Void it first, then delete" }, { status: 400 })
      }
      await supabase.from("arena_tracks").delete().eq("arena_id", arenaId)
      const { error } = await supabase.from("arenas").delete().eq("id", arenaId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: true })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
