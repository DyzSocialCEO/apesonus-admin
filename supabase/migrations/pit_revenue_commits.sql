-- ════════════════════════════════════════════════════════════════════
-- REVENUE PROOF — a public, on-chain commitment chain for the money.
--
-- A heartbeat job snapshots cumulative gross (sum of pit_revenue_ledger)
-- + the pool split + total paid out, chains it to the previous commit,
-- hashes it, and posts the hash to Solana (SPL Memo, same wallet as the
-- play chain). Partners — anyone — can re-hash a commit's canonical
-- preimage and match it against the on-chain memo, so the gross can't be
-- understated or rewritten after the fact. Mirrors pit_chain_commits but
-- for revenue, and is fully independent of it.
--
-- Run in Supabase SQL Editor. Additive and safe to re-run.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pit_revenue_commits (
  seq              BIGINT PRIMARY KEY,
  period_end       TIMESTAMPTZ NOT NULL,
  gross_cents      BIGINT NOT NULL,
  ops_cents        BIGINT NOT NULL,
  team_cents       BIGINT NOT NULL,
  eco_cents        BIGINT NOT NULL,
  paid_cents       BIGINT NOT NULL,
  ops_pct          NUMERIC(5,2) NOT NULL,
  team_pct         NUMERIC(5,2) NOT NULL,
  eco_pct          NUMERIC(5,2) NOT NULL,
  prev_hash        TEXT,
  commit_hash      TEXT NOT NULL,
  commit_canonical TEXT NOT NULL,
  signature        TEXT,
  rpc_cluster      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pit_revenue_commits_seq ON pit_revenue_commits (seq DESC);

-- Public read (anyone can audit), service-role writes — same as the play chain.
ALTER TABLE pit_revenue_commits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pit_revenue_commits_read ON pit_revenue_commits;
DROP POLICY IF EXISTS pit_revenue_commits_svc  ON pit_revenue_commits;
CREATE POLICY pit_revenue_commits_read ON pit_revenue_commits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY pit_revenue_commits_svc  ON pit_revenue_commits FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT '✅ Revenue proof chain ready — pit_revenue_commits.' AS status;
