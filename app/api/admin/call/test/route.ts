import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE TEST BENCH. Admin only.
 *
 * Every button on the Test tab hits this with an { action }. It fabricates a
 * full day of THE CALL so the operator can watch the whole cycle without SQL,
 * then the launch wipe clears all of it.
 *
 * Everything it creates is tagged so it is obvious and removable: test users
 * have display_name starting 'TESTBOT', and it only ever touches the current
 * or a freshly made session. It refuses to run unless call_enabled is true,
 * so it cannot fabricate data on a live-but-closed game by accident.
 *
 * Actions:
 *   status       what test data exists right now
 *   seed         create N test payers with balances
 *   session      open today's session via the daily driver
 *   plays        pump paid plays into the top tracks (moves the chart)
 *   tickets      book fake tickets across the test payers
 *   advance      jump this session's clock so calling has closed / chart ended
 *   settle       run the daily driver (settles anything ended)
 *   clear_test   remove only TESTBOT users and their rows (leaves real data)
 */

type Body = Record<string, unknown>
const TESTPREFIX = "TESTBOT"

async function testUserIds(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<string[]> {
  const { data } = await supabase.from("users").select("id, display_name").ilike("display_name", `${TESTPREFIX}%`)
  return (data || []).map((u) => u.id)
}

// Delete recent sessions that have NO real (non-TESTBOT) tickets. This frees
// today's session slot after a prior test run settled one, without ever
// removing a session real users have entered.
async function clearTestSessions(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<number> {
  const { data: recent } = await supabase
    .from("pit_call_sessions").select("id").order("session_no", { ascending: false }).limit(8)
  let removed = 0
  for (const s of recent || []) {
    const { data: tix } = await supabase
      .from("pit_call_tickets").select("user_id").eq("session_id", s.id)
    const userIds = (tix || []).map((t) => t.user_id)
    let hasReal = false
    if (userIds.length) {
      const { data: realUsers } = await supabase
        .from("users").select("id").in("id", userIds).not("display_name", "ilike", `${TESTPREFIX}%`).limit(1)
      hasReal = (realUsers || []).length > 0
    }
    if (!hasReal) {
      await supabase.from("pit_call_sessions").delete().eq("id", s.id)
      removed++
    }
  }
  return removed
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const supabase = await createAdminClient()
    const ids = await testUserIds(supabase)

    const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(cfgRow?.value || "{}") } catch {}

    const { data: sessions } = await supabase
      .from("pit_call_sessions").select("id, session_no, status, call_closes_at, week_ends_at, recovery_fund_usdc")
      .order("session_no", { ascending: false }).limit(3)

    let testTickets = 0
    if (ids.length) {
      const { count } = await supabase
        .from("pit_call_tickets").select("id", { count: "exact", head: true }).in("user_id", ids)
      testTickets = count || 0
    }

    return NextResponse.json({
      enabled: cfg.call_enabled === true,
      test_payers: ids.length,
      test_tickets: testTickets,
      entry_spins: Number(cfg.call_ticket_price) || 40,
      recent_sessions: sessions || [],
    })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const b = (await request.json().catch(() => ({}))) as Body
    const action = String(b.action || "")
    const supabase = await createAdminClient()

    const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "pit_config").maybeSingle()
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(cfgRow?.value || "{}") } catch {}
    const enabled = cfg.call_enabled === true

    // clear_test and status are always allowed. The fabricating actions need
    // the game enabled, so we never accidentally seed a live-but-closed board.
    if (!enabled && action !== "clear_test") {
      return NextResponse.json(
        { error: "Turn The Call on first (Knobs tab). The test bench needs it enabled to fabricate a board." },
        { status: 409 },
      )
    }

    // ── RUN ALL: the whole cycle, correctly ordered, one click ──────
    // The step-by-step buttons can desync (settle closes the session, then
    // "tickets" has nothing open). This does the entire day in the right
    // order, and crucially books the winning ticket AFTER plays are pumped so
    // it calls the tracks that actually lead. Guaranteed Full Recovery.
    if (action === "run_all") {
      const log: Record<string, unknown> = {}

      // 1. clear any prior test run so we start clean
      {
        const ids = await testUserIds(supabase)
        if (ids.length) await supabase.from("users").delete().in("id", ids)
      }

      // 1b. clear any leftover session blocking a fresh open. Earlier runs
      // settle a session in today's slot and the driver will not reopen an
      // existing day, so delete recent sessions that have no real (non-TESTBOT)
      // tickets. Live data is never touched.
      await clearTestSessions(supabase)

      // 2. seed payers
      const payers: string[] = []
      for (let i = 0; i < 10; i++) {
        const id = crypto.randomUUID()
        const { error } = await supabase.from("users").insert({ id, display_name: `${TESTPREFIX}_${i + 1}_${id.slice(0, 4)}` })
        if (error) continue
        await supabase.from("pit_ammo_purchases").insert({ user_id: id, ammo_amount: 2000, usd_cents: 10000, rail: "usdc", status: "confirmed" })
        await supabase.from("pit_ammo_balances").insert({ user_id: id, balance: 2000 })
        payers.push(id)
      }
      log.seeded = payers.length
      if (!payers.length) return NextResponse.json({ error: "Could not seed payers." }, { status: 500 })

      // 3. open today's session (fresh) via the driver
      await supabase.rpc("pit_call_day_open")
      const { data: sess } = await supabase
        .from("pit_call_sessions").select("id, week_starts_at, week_ends_at")
        .eq("status", "open").order("session_no", { ascending: false }).limit(1).maybeSingle()
      if (!sess) return NextResponse.json({ error: "No open session after opening. Is a session already running for today? Clear test data and retry." }, { status: 409 })
      log.session = sess.id

      // 4. pump weighted plays into the chart-day window so a clear top 5 forms
      const { data: cat } = await supabase.from("pit_call_catalogue").select("track_id, artist_id")
      if (!cat || cat.length < 5) return NextResponse.json({ error: "Need at least 5 tracks on the chart." }, { status: 409 })
      const when = new Date(new Date(sess.week_starts_at).getTime() + 3600_000).toISOString()
      const playRows: { user_id: string; artist_id: string; track_id: number; source: string; ammo_cost: number; played_at: string }[] = []
      cat.forEach((t, idx) => {
        const base = Math.max(1, 40 - idx * 3)
        for (let p = 0; p < base; p++) {
          playRows.push({ user_id: payers[(idx + p) % payers.length], artist_id: t.artist_id, track_id: t.track_id, source: "ammo", ammo_cost: 1, played_at: when })
        }
      })
      for (let i = 0; i < playRows.length; i += 500) await supabase.from("pit_qualified_plays").insert(playRows.slice(i, i + 500))
      log.plays = playRows.length

      // 5. work out the ACTUAL leaders from the plays just pumped
      const { data: counted } = await supabase.rpc("pit_counted_plays", { p_from: sess.week_starts_at, p_to: sess.week_ends_at })
      const leaders = ((counted || []) as { track_id: number; counted: number }[])
        .sort((a, b) => b.counted - a.counted || a.track_id - b.track_id)
        .slice(0, 5).map((r) => r.track_id)
      log.leaders = leaders

      // 6. book tickets: payer 0 calls the real leaders exactly (guaranteed
      //    Full Recovery), the rest shuffle so other tiers fill in
      const allTracks = cat.map((t) => t.track_id)
      let booked = 0
      for (let i = 0; i < payers.length; i++) {
        const picks = i === 0 ? leaders : [...allTracks].sort(() => Math.random() - 0.5).slice(0, 5)
        const { data, error } = await supabase.rpc("pit_call_ticket", { p_user: payers[i], p_session: sess.id, p_picks: picks })
        if (!error && (data as { ok?: boolean })?.ok) booked++
      }
      log.booked = booked

      // 7. jump the clock: backdate so calling closed and chart day ended
      const now = Date.now()
      await supabase.from("pit_call_sessions").update({
        call_opens_at: new Date(now - 3 * 86400_000).toISOString(),
        call_closes_at: new Date(now - 2 * 86400_000).toISOString(),
        week_starts_at: new Date(now - 2 * 86400_000).toISOString(),
        week_ends_at: new Date(now - 60_000).toISOString(),
        status: "running",
      }).eq("id", sess.id)
      // move the plays into the new backdated chart window so they still count
      await supabase.from("pit_qualified_plays")
        .update({ played_at: new Date(now - 2 * 86400_000 + 3600_000).toISOString() })
        .eq("source", "ammo").in("user_id", payers)

      // 8. settle via the driver
      const { data: settleRes } = await supabase.rpc("pit_call_day_open")
      log.settle = settleRes

      return NextResponse.json({ ok: true, ...log })
    }

    // ── SEED test payers ────────────────────────────────────────────
    if (action === "seed") {
      const n = Math.min(Math.max(Math.floor(Number(b.count) || 5), 1), 25)
      const made: string[] = []
      for (let i = 0; i < n; i++) {
        const id = crypto.randomUUID()
        const { error: uErr } = await supabase.from("users").insert({ id, display_name: `${TESTPREFIX}_${i + 1}_${id.slice(0, 4)}` })
        if (uErr) continue
        // a confirmed purchase makes them a payer; a fat balance lets them play
        await supabase.from("pit_ammo_purchases").insert({ user_id: id, ammo_amount: 2000, usd_cents: 10000, rail: "usdc", status: "confirmed" })
        await supabase.from("pit_ammo_balances").insert({ user_id: id, balance: 2000 })
        made.push(id)
      }
      return NextResponse.json({ ok: true, seeded: made.length })
    }

    // ── OPEN today's session via the real daily driver ──────────────
    if (action === "session") {
      const { data, error } = await supabase.rpc("pit_call_day_open")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, result: data })
    }

    // ── PUMP plays into the chart ───────────────────────────────────
    // Distributes paid plays across the catalogue, weighted so a clear top
    // few emerge. Writes them into the OPEN session's chart-day window so the
    // chart actually moves.
    if (action === "plays") {
      const ids = await testUserIds(supabase)
      if (!ids.length) return NextResponse.json({ error: "Seed test payers first." }, { status: 409 })

      const { data: sess } = await supabase
        .from("pit_call_sessions").select("id, week_starts_at, week_ends_at, status")
        .in("status", ["open", "running"]).order("session_no", { ascending: false }).limit(1).maybeSingle()
      if (!sess) return NextResponse.json({ error: "Open a session first." }, { status: 409 })

      const { data: cat } = await supabase.from("pit_call_catalogue").select("track_id, artist_id")
      if (!cat || !cat.length) return NextResponse.json({ error: "No tracks on the chart. Add tracks first." }, { status: 409 })

      // Play into the chart-day window (its start), a moment inside it.
      const when = new Date(new Date(sess.week_starts_at).getTime() + 3600_000).toISOString()

      // Weighted: first tracks get more plays, so a real top 5 forms.
      const rows: { user_id: string; artist_id: string; track_id: number; source: string; ammo_cost: number; played_at: string }[] = []
      cat.forEach((t, idx) => {
        const base = Math.max(1, 40 - idx * 3) // 40, 37, 34 ... tapering
        for (let p = 0; p < base; p++) {
          const uid = ids[(idx + p) % ids.length]
          rows.push({ user_id: uid, artist_id: t.artist_id, track_id: t.track_id, source: "ammo", ammo_cost: 1, played_at: when })
        }
      })

      // insert in chunks
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("pit_qualified_plays").insert(rows.slice(i, i + 500))
      }
      return NextResponse.json({ ok: true, plays: rows.length, into_session: sess.id })
    }

    // ── BOOK fake tickets ───────────────────────────────────────────
    if (action === "tickets") {
      const ids = await testUserIds(supabase)
      if (!ids.length) return NextResponse.json({ error: "Seed test payers first." }, { status: 409 })

      const { data: sess } = await supabase
        .from("pit_call_sessions").select("id, status").eq("status", "open")
        .order("session_no", { ascending: false }).limit(1).maybeSingle()
      if (!sess) return NextResponse.json({ error: "Need an OPEN session (calling window). Open one first." }, { status: 409 })

      const { data: cat } = await supabase.from("pit_call_catalogue").select("track_id")
      const trackIds = (cat || []).map((t) => t.track_id)
      if (trackIds.length < 5) return NextResponse.json({ error: "Need at least 5 tracks." }, { status: 409 })

      // Each test payer books one ticket. One of them calls the exact leading
      // order so a Full Recovery is guaranteed for the demo.
      let booked = 0
      for (let i = 0; i < ids.length; i++) {
        // first payer calls tracks in catalogue order (likely the leaders);
        // the rest shuffle so tiers spread
        const picks = i === 0
          ? trackIds.slice(0, 5)
          : [...trackIds].sort(() => Math.random() - 0.5).slice(0, 5)
        const { data, error } = await supabase.rpc("pit_call_ticket", {
          p_user: ids[i], p_session: sess.id, p_picks: picks,
        })
        if (!error && (data as { ok?: boolean })?.ok) booked++
      }
      return NextResponse.json({ ok: true, booked })
    }

    // ── ADVANCE the clock ───────────────────────────────────────────
    // Backdates the current session so calling has closed and the chart day
    // has ended, making it settle-ready. Purely a time shift for the demo.
    if (action === "advance") {
      const { data: sess } = await supabase
        .from("pit_call_sessions").select("id").in("status", ["open", "running"])
        .order("session_no", { ascending: false }).limit(1).maybeSingle()
      if (!sess) return NextResponse.json({ error: "No session to advance." }, { status: 409 })

      const now = Date.now()
      await supabase.from("pit_call_sessions").update({
        call_opens_at: new Date(now - 3 * 86400_000).toISOString(),
        call_closes_at: new Date(now - 2 * 86400_000).toISOString(),
        week_starts_at: new Date(now - 2 * 86400_000).toISOString(),
        week_ends_at: new Date(now - 60_000).toISOString(),
        status: "running",
      }).eq("id", sess.id)
      return NextResponse.json({ ok: true, advanced: sess.id })
    }

    // ── SETTLE via the daily driver ─────────────────────────────────
    if (action === "settle") {
      const { data, error } = await supabase.rpc("pit_call_day_open")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, result: data })
    }

    // ── CLEAR only test data ────────────────────────────────────────
    if (action === "clear_test") {
      const sessionsRemoved = await clearTestSessions(supabase)
      const ids = await testUserIds(supabase)
      if (!ids.length) return NextResponse.json({ ok: true, cleared: 0, sessions_removed: sessionsRemoved })
      const { error } = await supabase.from("users").delete().in("id", ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, cleared: ids.length, sessions_removed: sessionsRemoved })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
