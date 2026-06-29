/**
 * lib/onus-chain/revenue-anchor.ts — the revenue half of the proof layer.
 *
 * Snapshots cumulative gross + the pool split + total paid out (via the
 * distribution overview — the single source of truth), chains it to the
 * previous revenue commit, hashes the canonical preimage, and posts the hash
 * to Solana via SPL Memo (same wallet/secret as the play chain). Skips when
 * nothing moved since the last commit, so the chain only grows on real change.
 *
 * Independent of the play chain (pit_chain_commits) — never touches it.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { hashDataset, commitHash } from "./commit"

export interface RevenueAnchorResult {
  ok: boolean
  skipped?: boolean
  seq?: number
  gross_cents?: number
  commit_hash?: string
  signature?: string | null
  cluster?: string | null
  error?: string
}

export async function anchorRevenue(supabase: SupabaseClient): Promise<RevenueAnchorResult> {
  // Cumulative snapshot — reuse the overview so the books are one source of truth.
  const { data: ov, error } = await supabase.rpc("pit_distribution_overview")
  if (error || !ov) return { ok: false, error: error?.message || "overview unavailable" }
  const o = ov as Record<string, any>

  const gross_cents = Math.round(Number(o.gross_cents || 0))
  const ops_cents = Math.round(Number(o.ops_cents || 0))
  const team_cents = Math.round(Number(o.team_cents || 0))
  const eco_cents = Math.round(Number(o.eco_cents || 0))
  const paid_cents = (o.partners || []).reduce((a: number, p: any) => a + Number(p.paid_cents || 0), 0)
  const ops_pct = Number(o.config?.ops_pct ?? 0)
  const team_pct = Number(o.config?.team_pct ?? 0)
  const eco_pct = Number(o.config?.eco_pct ?? 0)

  // Chain tip.
  const { data: last } = await supabase
    .from("pit_revenue_commits")
    .select("seq, commit_hash, gross_cents, paid_cents")
    .order("seq", { ascending: false }).limit(1).maybeSingle()

  // Nothing changed since the last commit → no new commit.
  if (last && Number(last.gross_cents) === gross_cents && Number(last.paid_cents) === paid_cents) {
    return { ok: true, skipped: true, seq: Number(last.seq), gross_cents }
  }

  const seq = Number(last?.seq || 0) + 1
  const prev_hash = (last?.commit_hash as string) || null
  const period_end = new Date().toISOString()
  const commitObj = { seq, period_end, gross_cents, ops_cents, team_cents, eco_cents, paid_cents, ops_pct, team_pct, eco_pct, prev_hash }
  const { canonical: commit_canonical, hash: commit_hash } = hashDataset(commitObj)

  const anchor = await commitHash("revenue", commitObj) // posts APESONUS:commit:revenue:<commit_hash>
  const signature = anchor?.signature || null
  const cluster = (process.env.ONUS_RPC_URL || "https://api.devnet.solana.com").includes("devnet") ? "devnet" : "mainnet-beta"

  const { error: insErr } = await supabase.from("pit_revenue_commits").insert({
    seq, period_end, gross_cents, ops_cents, team_cents, eco_cents, paid_cents,
    ops_pct, team_pct, eco_pct, prev_hash, commit_hash, commit_canonical,
    signature, rpc_cluster: signature ? cluster : null,
  })
  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true, seq, gross_cents, commit_hash, signature, cluster: signature ? cluster : null }
}
