-- ════════════════════════════════════════════════════════════════════
-- DISTRIBUTION — clean profit split + partner accruals + payouts.
--
-- Every confirmed purchase already lands one immutable row in
-- pit_revenue_ledger (gross usd_cents). A trigger on that ledger splits
-- the gross into three pools by the configured %s and FREEZES each
-- locked partner's cut of the team pool — at that moment, for whoever is
-- active then. Forward-only: a partner added today earns only from
-- today's revenue on; nobody's frozen balance ever moves when a new
-- partner joins. Idempotent: one accrual row per (purchase, partner).
--
--   Operational %  → reserve wallet (servers/CDN/fees)
--   Team %         → partners (manual %s you set + lock; remainder = you)
--   Ecosystem %    → ambassadors / marketing / user promos
--
-- Run in Supabase SQL Editor. Additive and safe to re-run.
-- ════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Pool config — one row. %s are 0..100 and must total 100 (app enforces).
CREATE TABLE IF NOT EXISTS pit_distribution_config (
  id         INT PRIMARY KEY DEFAULT 1,
  ops_pct    NUMERIC(5,2) NOT NULL DEFAULT 30,
  team_pct   NUMERIC(5,2) NOT NULL DEFAULT 40,
  eco_pct    NUMERIC(5,2) NOT NULL DEFAULT 30,
  ops_wallet TEXT,
  eco_wallet TEXT,
  is_locked  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pit_distribution_config_one_row CHECK (id = 1)
);
INSERT INTO pit_distribution_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Partners — added manually, then locked. share_pct is a % (0..100) of
--    the TEAM pool. Locked partners accrue; the unallocated remainder is you.
CREATE TABLE IF NOT EXISTS pit_partners (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  sol_address TEXT NOT NULL,
  share_pct   NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
  is_locked   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Accruals — a partner's frozen cut for one purchase. UNIQUE makes the
--    split idempotent if the ledger insert is ever replayed.
CREATE TABLE IF NOT EXISTS pit_partner_accruals (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id  BIGINT NOT NULL,
  partner_id   BIGINT NOT NULL REFERENCES pit_partners(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, partner_id)
);
CREATE INDEX IF NOT EXISTS idx_pit_partner_accruals_partner ON pit_partner_accruals (partner_id);

-- 4. Payouts — money actually sent to a partner (USDC). Manual now (admin
--    records the tx they sent); auto mode later writes rows the same way.
CREATE TABLE IF NOT EXISTS pit_partner_payouts (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id   BIGINT NOT NULL REFERENCES pit_partners(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  tx_signature TEXT,
  method       TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'auto')),
  status       TEXT NOT NULL DEFAULT 'paid'   CHECK (status IN ('paid', 'pending', 'failed')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pit_partner_payouts_partner ON pit_partner_payouts (partner_id);

ALTER TABLE pit_distribution_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pit_partners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pit_partner_accruals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pit_partner_payouts     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pit_distribution_config_svc ON pit_distribution_config;
DROP POLICY IF EXISTS pit_partners_svc            ON pit_partners;
DROP POLICY IF EXISTS pit_partner_accruals_svc    ON pit_partner_accruals;
DROP POLICY IF EXISTS pit_partner_payouts_svc     ON pit_partner_payouts;
CREATE POLICY pit_distribution_config_svc ON pit_distribution_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pit_partners_svc            ON pit_partners            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pit_partner_accruals_svc    ON pit_partner_accruals    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pit_partner_payouts_svc     ON pit_partner_payouts     FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- 5. The split. Freezes each locked partner's cut of the team pool for
--    one purchase. Called by the ledger trigger — fires once per
--    confirmed purchase, forward-only. Run on its own.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pit_distribute_revenue(p_purchase_id BIGINT, p_usd_cents INTEGER)
RETURNS VOID AS $fn$
DECLARE
  v_team_pct   NUMERIC;
  v_team_cents INTEGER;
BEGIN
  SELECT team_pct INTO v_team_pct FROM pit_distribution_config WHERE id = 1;
  v_team_cents := round(p_usd_cents * COALESCE(v_team_pct, 40) / 100.0);

  INSERT INTO pit_partner_accruals (purchase_id, partner_id, amount_cents)
  SELECT p_purchase_id, p.id, round(v_team_cents * p.share_pct / 100.0)::int
  FROM pit_partners p
  WHERE p.is_active AND p.is_locked AND p.share_pct > 0
  ON CONFLICT (purchase_id, partner_id) DO NOTHING;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION pit_distribute_revenue(BIGINT, INTEGER) TO service_role;

-- The trigger: split every new revenue-ledger row.
CREATE OR REPLACE FUNCTION pit_revenue_ledger_distribute()
RETURNS TRIGGER AS $trg$
BEGIN
  PERFORM pit_distribute_revenue(NEW.purchase_id, NEW.usd_cents);
  RETURN NEW;
END;
$trg$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_pit_revenue_distribute ON pit_revenue_ledger;
CREATE TRIGGER trg_pit_revenue_distribute
  AFTER INSERT ON pit_revenue_ledger
  FOR EACH ROW EXECUTE FUNCTION pit_revenue_ledger_distribute();

-- ──────────────────────────────────────────────────────────────────
-- 6. Overview for the admin: pools + every active partner's accrued /
--    paid / owed, plus your remainder slice of the team pool. Run alone.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pit_distribution_overview()
RETURNS JSONB AS $ov$
DECLARE
  v_cfg      pit_distribution_config%ROWTYPE;
  v_gross    BIGINT;
  v_alloc    NUMERIC;
  v_partners JSONB;
BEGIN
  SELECT * INTO v_cfg FROM pit_distribution_config WHERE id = 1;
  SELECT COALESCE(SUM(usd_cents), 0) INTO v_gross FROM pit_revenue_ledger;
  SELECT COALESCE(SUM(share_pct), 0) INTO v_alloc FROM pit_partners WHERE is_active AND is_locked;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at'), '[]'::jsonb) INTO v_partners FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'name', p.name, 'sol_address', p.sol_address,
      'share_pct', p.share_pct, 'is_locked', p.is_locked, 'is_active', p.is_active,
      'created_at', p.created_at,
      'accrued_cents', COALESCE(a.acc, 0),
      'paid_cents', COALESCE(pay.paid, 0),
      'owed_cents', COALESCE(a.acc, 0) - COALESCE(pay.paid, 0)
    ) AS row
    FROM pit_partners p
    LEFT JOIN (SELECT partner_id, SUM(amount_cents) acc FROM pit_partner_accruals GROUP BY partner_id) a ON a.partner_id = p.id
    LEFT JOIN (SELECT partner_id, SUM(amount_cents) paid FROM pit_partner_payouts WHERE status = 'paid' GROUP BY partner_id) pay ON pay.partner_id = p.id
    WHERE p.is_active
  ) s;

  RETURN jsonb_build_object(
    'config', jsonb_build_object(
      'ops_pct', v_cfg.ops_pct, 'team_pct', v_cfg.team_pct, 'eco_pct', v_cfg.eco_pct,
      'ops_wallet', v_cfg.ops_wallet, 'eco_wallet', v_cfg.eco_wallet, 'is_locked', v_cfg.is_locked
    ),
    'gross_cents', v_gross,
    'ops_cents',   round(v_gross * v_cfg.ops_pct  / 100.0),
    'team_cents',  round(v_gross * v_cfg.team_pct / 100.0),
    'eco_cents',   round(v_gross * v_cfg.eco_pct  / 100.0),
    'allocated_pct', v_alloc,
    'founder_pct',   GREATEST(0, 100 - v_alloc),
    'partners', v_partners
  );
END;
$ov$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION pit_distribution_overview() TO service_role;

SELECT '✅ Distribution ready — pools, partners, auto-split trigger, payouts, overview.' AS status;
