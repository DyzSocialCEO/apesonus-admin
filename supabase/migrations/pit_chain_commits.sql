-- ────────────────────────────────────────────────────────────────────
-- pit_chain_commits — the tamper-evidence ledger.
-- ────────────────────────────────────────────────────────────────────
-- Each row is one anchored batch covering a time period. The hourly anchor
-- cron builds the Merkle root of that period's plays, hashes the Node Power +
-- Read state, links to the previous commit's hash (the chain), hashes the whole
-- thing, and posts that hash to Solana via SPL Memo. Anyone can rebuild a
-- period's root from the raw plays and match it to what's anchored on-chain;
-- if a single play or result was edited after anchoring, the root won't match.
--
-- Read-only to the public so the verify page can list and check the chain.

CREATE TABLE IF NOT EXISTS pit_chain_commits (
  seq           bigint PRIMARY KEY,
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  play_count    integer NOT NULL DEFAULT 0,
  plays_root    text NOT NULL,   -- Merkle root of the period's plays
  state_hash    text NOT NULL,   -- hash of Node Power + Read state at close
  prev_hash     text,            -- previous commit_hash; NULL on the genesis row
  commit_hash   text NOT NULL,   -- hash of the whole canonical commit (incl prev_hash)
  signature     text,            -- Solana tx signature; NULL until anchored on-chain
  rpc_cluster   text,            -- devnet | mainnet-beta
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pit_chain_commits_period_idx ON pit_chain_commits (period_end DESC);

ALTER TABLE pit_chain_commits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pit_chain_commits_public_read ON pit_chain_commits;
CREATE POLICY pit_chain_commits_public_read ON pit_chain_commits FOR SELECT USING (true);
GRANT SELECT ON pit_chain_commits TO anon, authenticated;
