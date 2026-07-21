import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { commitHash, hashDataset } from "@/lib/onus-chain/commit"
import { playsRoot, stateDigest, type PlayLeaf } from "@/lib/onus-chain/snapshot"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/cron/anchor
 *
 * Builds one tamper-evidence commit for the window since the last commit:
 *   plays in window → Merkle root, Embers state → digest,
 *   chained to the previous commit's hash, the whole thing hashed and posted
 *   on-chain via SPL Memo. Stores the row in pit_chain_commits either way —
 *   if no signing key is set, signature stays null and the chain still builds.
 *
 * Auth: CRON_SECRET via x-admin-secret header or ?secret= query param.
 * Schedule hourly. Idempotent enough: each run anchors only NEW plays.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(request.url)
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret")
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createAdminClient()

    // ── Previous commit (the chain tip) ──
    const { data: last } = await supabase
      .from("pit_chain_commits")
      .select("seq, period_end, commit_hash")
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle()

    const periodEnd = new Date().toISOString()
    let periodStart: string
    if (last?.period_end) {
      periodStart = last.period_end
    } else {
      // Genesis: start from the earliest play so the first commit covers history.
      const { data: first } = await supabase
        .from("play_history").select("played_at").order("played_at", { ascending: true }).limit(1).maybeSingle()
      periodStart = first?.played_at || new Date(Date.now() - 3600_000).toISOString()
    }

    // ── Plays in the window → Merkle root ──
    const { data: plays } = await supabase
      .from("play_history")
      .select("id, user_id, track_id, played_at")
      .gte("played_at", periodStart)
      .lt("played_at", periodEnd)
      .order("played_at", { ascending: true })
      .limit(50000)
    const leaves: PlayLeaf[] = (plays || []).map((p) => ({
      id: p.id, user_id: p.user_id, track_id: p.track_id, played_at: p.played_at,
    }))
    const plays_root = playsRoot(leaves)

    // ── Embers state → digest ──
    // Every account's Ember balance, sorted by user, hashed deterministically
    // and anchored alongside the plays root. Makes total Embers publicly
    // reconcilable against the play chain — none can be conjured off-ledger.
    const { data: emberRows } = await supabase
      .from("pit_embers").select("user_id, embers").gt("embers", 0)
    const embers = (emberRows || []).map((e) => ({ u: e.user_id, e: Number(e.embers) }))
      .sort((x, y) => x.u.localeCompare(y.u))
    const embers_total = embers.reduce((a, r) => a + r.e, 0)
    const state_hash = stateDigest({ embers, embers_total })

    // ── Build, chain, hash, anchor ──
    const seq = Number(last?.seq || 0) + 1
    const prev_hash = last?.commit_hash || null
    const commitObj = { seq, period_start: periodStart, period_end: periodEnd, play_count: leaves.length, plays_root, state_hash, prev_hash }

    // Capture the EXACT canonical string that gets hashed. We persist this as
    // commit_canonical so the public /proof verifier can recompute the hash from
    // the literal preimage — Postgres normalizes timestamps on storage, so the
    // period_start/period_end strings can't otherwise be reconstructed exactly.
    const { canonical: commit_canonical, hash: commit_hash } = hashDataset(commitObj)
    const anchor = await commitHash("chain", commitObj) // posts APESONUS:commit:chain:<commit_hash>
    const signature = anchor?.signature || null
    const cluster = (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet") ? "devnet" : "mainnet-beta"

    const { error: insErr } = await supabase.from("pit_chain_commits").insert({
      seq, period_start: periodStart, period_end: periodEnd, play_count: leaves.length,
      plays_root, state_hash, prev_hash, commit_hash, commit_canonical,
      signature, rpc_cluster: signature ? cluster : null,
    })
    if (insErr) {
      console.error("[anchor] insert failed:", insErr.message)
      return NextResponse.json({ error: "insert failed", detail: insErr.message }, { status: 500 })
    }

    // Also anchor the Ammo supply ledger on the same beat — best-effort, never
    // blocks the play-chain commit. Makes circulating-vs-(purchased+granted)
    // publicly reconcilable so phantom Ammo is visible.
    let ammo: { hash?: string; signature?: string | null } = {}
    try {
      const { anchorAmmoLedger } = await import("@/lib/onus-chain/ammo-ledger")
      const res = await anchorAmmoLedger(supabase)
      ammo = { hash: res.hash, signature: res.signature }
    } catch (e) {
      console.error("[anchor] ammo ledger failed:", (e as Error).message)
    }

    // Rewards ledger on the same beat — Golden Ticket draws + Co-Sign
    // settlements, anonymized and anchored. Best-effort like the ammo ledger;
    // never blocks the play-chain commit.
    let rewards: { hash?: string; signature?: string | null } = {}
    try {
      const { anchorRewardsLedger } = await import("@/lib/onus-chain/rewards-ledger")
      const res = await anchorRewardsLedger(supabase)
      rewards = { hash: res.hash, signature: res.signature }
    } catch (e) {
      console.error("[anchor] rewards ledger failed:", (e as Error).message)
    }

    // THE DRAW on the same beat — each settled day's seed + five winners hashed
    // and anchored once, keyed off a null signature so it retries until it
    // lands. Best-effort like the others; never blocks the play-chain commit.
    let draw: { anchored?: string[] } = {}
    try {
      const { anchorDrawLedger } = await import("@/lib/onus-chain/draw-ledger")
      const res = await anchorDrawLedger(supabase)
      draw = { anchored: res.anchored }
    } catch (e) {
      console.error("[anchor] draw ledger failed:", (e as Error).message)
    }

    return NextResponse.json({
      ok: true, seq, play_count: leaves.length, plays_root, commit_hash,
      anchored: !!signature, signature, cluster: signature ? cluster : null,
      period: { start: periodStart, end: periodEnd },
      ammo_ledger: ammo,
      rewards_ledger: rewards,
      draw_ledger: draw,
    })
  } catch (e) {
    console.error("[anchor] error:", (e as Error).message)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
