-- ────────────────────────────────────────────────────────────────────
-- Add commit_canonical to pit_chain_commits.
-- ────────────────────────────────────────────────────────────────────
-- The /proof page lets anyone recompute a commit's hash and match it. But the
-- hash preimage included period_start/period_end as the exact ISO strings the
-- anchor cron held at commit time, and Postgres normalizes timestamps on
-- storage — so those exact bytes can't be reconstructed from the stored row.
--
-- Fix: persist the exact canonical string that was hashed. The verifier hashes
-- THIS string (the literal preimage) and matches it to commit_hash — bulletproof,
-- no timestamp-format guessing. Existing rows stay NULL and are shown as
-- "chain-verified" (via linkage) rather than recomputed.

ALTER TABLE pit_chain_commits
  ADD COLUMN IF NOT EXISTS commit_canonical text;
