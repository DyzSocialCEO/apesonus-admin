import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"
import { logAdminAction } from "@/lib/admin-audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CALL desk.
 *
 * GET   config, rounds, winners, this week's board, the withdrawal queue
 * PATCH any setting, the board, a withdrawal, or the doctor's line
 * POST  run the tick by hand when a cron run was missed
 *
 * WHAT THIS ROUTE WILL NOT DO: return a live per-song count. A round that has
 * not settled carries no chart, here or anywhere. If the operator can see who
 * is winning mid week then so can anyone standing near the screen, and the
 * blind board stops meaning anything.
 */

const NUMERIC_SETTINGS = [
  "prize_onus",
  "entry_spins",
  "board_size",
  "winner_seats",
  "useless_min_spins",
  "lock_hours",
  "freeze_hours",
  "round_hours",
] as const

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = await createAdminClient()
    const [config, rounds, awards, cards, note, queue] = await Promise.all([
      supabase
        .from("call_config")
        .select(
          "prize_onus, enabled, entry_spins, board_size, winner_seats, useless_min_spins, lock_hours, freeze_hours, round_hours, carry_usd",
        )
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("call_rounds")
        .select("id, opens_at, locks_at, freezes_at, prize_usd, status, board, top_song, useless_song, chart, lock_hash, lock_tx, settled_at")
        .order("opens_at", { ascending: false })
        .limit(14),
      supabase.from("call_round_awards").select("round_id, seat, amount_usd").limit(500),
      supabase.from("call_round_cards").select("round_id").limit(20000),
      supabase
        .from("clinic_notes")
        .select("line")
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
      supabase
        .from("call_withdrawals")
        .select("id, user_id, wallet_address, amount_onus, status, tx_signature, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ])

    const winnersPerRound: Record<string, { seat: number; amount_usd: number }[]> = {}
    for (const a of (awards.data ?? []) as { round_id: string; seat: number; amount_usd: number }[]) {
      ;(winnersPerRound[a.round_id] ??= []).push({ seat: a.seat, amount_usd: a.amount_usd })
    }
    const cardsPerRound: Record<string, number> = {}
    for (const c of (cards.data ?? []) as { round_id: string }[]) {
      cardsPerRound[c.round_id] = (cardsPerRound[c.round_id] ?? 0) + 1
    }

    // The board of the open round, with titles, and NO counts.
    const open = ((rounds.data ?? []) as { id: string; status: string; board: number[] }[]).find(
      (r) => r.status === "open",
    )
    let boardTracks: { id: number; title: string; artist: string }[] = []
    if (open?.board?.length) {
      const { data } = await supabase.from("tracks").select("id, title, artist").in("id", open.board)
      const byId = new Map(((data ?? []) as { id: number; title: string; artist: string }[]).map((t) => [t.id, t]))
      boardTracks = open.board.map((id) => byId.get(id) ?? { id, title: `Track ${id}`, artist: "" })
    }

    return NextResponse.json({
      config: config.data ?? {},
      rounds: rounds.data ?? [],
      winnersPerRound,
      cardsPerRound,
      board: boardTracks,
      openRoundId: open?.id ?? null,
      withdrawals: queue.data ?? [],
      note: note.data?.line ?? "",
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      enabled?: boolean
      board?: number[]
      reshuffle?: boolean
      withdrawal?: { id: number; action: "sent" | "rejected"; tx?: string }
      note?: { line: string }
    }
    const supabase = await createAdminClient()

    if (body.note) {
      const today = new Date().toISOString().slice(0, 10)
      const line = String(body.note.line ?? "").trim().slice(0, 240)
      const { error } = line
        ? await supabase.from("clinic_notes").upsert({ day: today, line }, { onConflict: "day" })
        : await supabase.from("clinic_notes").delete().eq("day", today)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "clinic.note", { day: today, cleared: !line })
      return NextResponse.json({ ok: true })
    }

    if (body.withdrawal?.id) {
      const action = body.withdrawal.action
      if (action !== "sent" && action !== "rejected") {
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
      }
      const tx = typeof body.withdrawal.tx === "string" ? body.withdrawal.tx.trim() : ""
      if (action === "sent" && tx.length < 32) {
        return NextResponse.json({ error: "Paste the payout signature first" }, { status: 400 })
      }
      const { data, error } = await supabase
        .from("call_withdrawals")
        .update({
          status: action,
          tx_signature: action === "sent" ? tx : null,
          handled_at: new Date().toISOString(),
        })
        .eq("id", body.withdrawal.id)
        .eq("status", "requested")
        .select("id")
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: "Already handled" }, { status: 409 })
      await logAdminAction(supabase, request, session.username, "call.withdrawal", { id: body.withdrawal.id, action })
      return NextResponse.json({ ok: true })
    }

    // Changing the board of a round people have already called is changing
    // the question after the answers are in. Refused, always.
    if (body.board || body.reshuffle) {
      const { data: open } = await supabase
        .from("call_rounds")
        .select("id, board")
        .eq("status", "open")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!open?.id) return NextResponse.json({ error: "No round is open" }, { status: 409 })

      const { count } = await supabase
        .from("call_round_cards")
        .select("user_id", { count: "exact", head: true })
        .eq("round_id", open.id)
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: `${count} cards are already on this board. It cannot be changed now.` },
          { status: 409 },
        )
      }

      let board: number[] = []
      if (body.reshuffle) {
        const { data: cfg } = await supabase.from("call_config").select("board_size").eq("id", 1).maybeSingle()
        const size = Math.max(2, Number(cfg?.board_size ?? 10))
        const { data: all } = await supabase.from("tracks").select("id").eq("is_active", true).limit(1000)
        const ids = ((all ?? []) as { id: number }[]).map((t) => t.id)
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        board = ids.slice(0, size)
      } else {
        board = (body.board ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
        board = Array.from(new Set(board))
      }
      if (board.length < 2) {
        return NextResponse.json({ error: "A board needs at least two songs" }, { status: 400 })
      }

      const { error } = await supabase.from("call_rounds").update({ board }).eq("id", open.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logAdminAction(supabase, request, session.username, "call.board", { round: open.id, board })
      return NextResponse.json({ ok: true, board })
    }

    const update: Record<string, unknown> = {}
    for (const key of NUMERIC_SETTINGS) {
      const raw = Number(body[key])
      if (Number.isFinite(raw) && raw >= 0) update[key] = Math.floor(raw)
    }
    if (typeof body.enabled === "boolean") update.enabled = body.enabled

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }

    const { error } = await supabase.from("call_config").update(update).eq("id", 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction(supabase, request, session.username, "call.config", update)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    const action = String(body.action ?? "tick")
    const supabase = await createAdminClient()

    // END THE ROUND NOW. Pulls the freeze into the past and settles it, so the
    // chart is counted, the winners are worked out and the seats are paid
    // exactly the way they would be on a Saturday. Nothing is skipped.
    if (action === "settle") {
      // Straight to call_settle_round, NOT through the tick. The tick stops
      // dead when the Call is paused, so this button used to confirm and then
      // do nothing at all. Pausing stops the automatic machinery; it was never
      // meant to stop you finishing a round by hand.
      const { data, error } = await supabase.rpc("call_settle_round")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const r = (data ?? {}) as Record<string, any>
      if (r.ok !== true) {
        return NextResponse.json({ error: "No round is open to end." }, { status: 409 })
      }

      const top = r.top?.title ? `${r.top.title} (${r.top.spins} Spins)` : "nothing"
      const useless = r.useless?.title ? `${r.useless.title} (${r.useless.spins} Spins)` : "nothing qualified"
      const money =
        Number(r.paid) > 0
          ? `${r.paid} paid $${Number(r.each).toFixed(2)} each`
          : `nobody was right, $${Number(r.pot).toFixed(2)} carried`

      await logAdminAction(supabase, request, session.username, "call.settle", { round: r.round })
      return NextResponse.json({
        ok: true,
        settled: r.round,
        message: `Round ${r.round} settled. Ran the ward: ${top}. Did nothing: ${useless}. ${r.cards} cards, ${r.correct} correct, ${money}.`,
      })
    }

    // START A FRESH ROUND, beginning NOW rather than on the weekly schedule.
    //
    // The normal tick puts a round on the calendar: it opens on Sunday and
    // calling shuts 120 hours later. Ask for a round on a Thursday afternoon
    // and the calendar hands you one whose calling window closed last night,
    // which is correct and completely useless for testing or for restarting
    // after a pause. This one starts at this moment and runs the configured
    // hours from here.
    if (action === "fresh") {
      const { count } = await supabase
        .from("call_round_cards")
        .select("user_id", { count: "exact", head: true })
        .in(
          "round_id",
          (
            ((await supabase.from("call_rounds").select("id").eq("status", "open")).data ?? []) as {
              id: string
            }[]
          ).map((r) => r.id),
        )
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: `${count} cards are on the open round. End it instead of replacing it.` },
          { status: 409 },
        )
      }

      await supabase.from("call_rounds").delete().eq("status", "open")

      const { data: cfg } = await supabase
        .from("call_config")
        .select("prize_onus, board_size, lock_hours, freeze_hours, carry_usd")
        .eq("id", 1)
        .maybeSingle()

      const size = Math.max(2, Number(cfg?.board_size ?? 10))
      const { data: tracks } = await supabase.from("tracks").select("id").eq("is_active", true).limit(1000)
      const ids = ((tracks ?? []) as { id: number }[]).map((t) => t.id)
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
      }
      const board = ids.slice(0, size)
      if (board.length < 2) {
        return NextResponse.json({ error: "Not enough active songs for a board" }, { status: 409 })
      }

      const now = Date.now()
      const hrs = (n: number) => new Date(now + n * 3600_000).toISOString()
      const day = new Date(now).toISOString().slice(0, 10)

      // A round for today may already exist, settled, from earlier. Marking it
      // settled does not free the id, which is what "duplicate key value
      // violates call_rounds_pkey" was. Take the next free id instead:
      // 2026-08-07, then 2026-08-07-2, and so on.
      const { data: sameDay } = await supabase
        .from("call_rounds")
        .select("id")
        .like("id", `${day}%`)
      const taken = new Set(((sameDay ?? []) as { id: string }[]).map((r) => r.id))
      let id = day
      for (let n = 2; taken.has(id) && n < 100; n++) id = `${day}-${n}`
      if (taken.has(id)) {
        return NextResponse.json({ error: "Too many rounds already started today." }, { status: 409 })
      }

      const { error } = await supabase.from("call_rounds").insert({
        id,
        opens_at: new Date(now).toISOString(),
        locks_at: hrs(Number(cfg?.lock_hours ?? 120)),
        freezes_at: hrs(Number(cfg?.freeze_hours ?? 162)),
        board,
        prize_usd: Number(cfg?.prize_onus ?? 0) + Number(cfg?.carry_usd ?? 0),
        status: "open",
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from("call_config").update({ carry_usd: 0 }).eq("id", 1)

      await logAdminAction(supabase, request, session.username, "call.fresh", { round: id })
      return NextResponse.json({ ok: true, opened: id })
    }

    // This used to call call_week_tick, a function left over from the very
    // first version of the Call. The button ran and nothing happened.
    const { data, error } = await supabase.rpc("call_round_tick")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const row = Array.isArray(data) ? data[0] : data
    await logAdminAction(supabase, request, session.username, "call.tick", {
      opened: row?.opened ?? null,
      settled: row?.settled ?? null,
    })
    return NextResponse.json({ ok: true, opened: row?.opened ?? null, settled: row?.settled ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
