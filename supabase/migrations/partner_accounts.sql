-- ════════════════════════════════════════════════════════════════════
-- PARTNER LOGINS — read-only investor access.
--
-- The super-admin login stays env-based and untouched. This table holds
-- ONLY partner/investor accounts, each linked to a pit_partners row. They
-- log in at the same admin login page and are routed to a read-only /partner
-- portal that shows total gross + the pool split + THEIR OWN cut — never
-- anyone else's share or wallet.
--
-- Run in Supabase SQL Editor. Additive, safe to re-run.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS partner_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT   NOT NULL,                 -- stored lowercased
  password_hash        TEXT   NOT NULL,                 -- scrypt:salt:hash
  partner_id           BIGINT NOT NULL REFERENCES pit_partners(id) ON DELETE CASCADE,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_accounts_email ON partner_accounts (lower(email));

ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_accounts_svc ON partner_accounts;
CREATE POLICY partner_accounts_svc ON partner_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- Partner portal read model — gross + pools + ONE partner's numbers.
-- Deliberately returns nothing about other partners.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pit_partner_portal(p_partner_id BIGINT) RETURNS JSONB AS $pp$
DECLARE
  v_cfg     pit_distribution_config%ROWTYPE;
  v_gross   BIGINT;
  v_p       pit_partners%ROWTYPE;
  v_accrued BIGINT;
  v_paid    BIGINT;
  v_payouts JSONB;
BEGIN
  SELECT * INTO v_cfg FROM pit_distribution_config WHERE id = 1;
  SELECT COALESCE(SUM(usd_cents), 0) INTO v_gross FROM pit_revenue_ledger;
  SELECT * INTO v_p FROM pit_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_accrued FROM pit_partner_accruals WHERE partner_id = p_partner_id;
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid    FROM pit_partner_payouts  WHERE partner_id = p_partner_id AND status = 'paid';

  SELECT COALESCE(jsonb_agg(row ORDER BY ord DESC), '[]'::jsonb) INTO v_payouts FROM (
    SELECT created_at AS ord, jsonb_build_object(
      'amount_cents', amount_cents, 'status', status,
      'tx_signature', tx_signature, 'method', method, 'created_at', created_at
    ) AS row
    FROM pit_partner_payouts WHERE partner_id = p_partner_id
    ORDER BY created_at DESC LIMIT 100
  ) s;

  RETURN jsonb_build_object(
    'gross_cents', v_gross,
    'ops_pct', v_cfg.ops_pct, 'team_pct', v_cfg.team_pct, 'eco_pct', v_cfg.eco_pct,
    'ops_cents',  round(v_gross * v_cfg.ops_pct  / 100.0),
    'team_cents', round(v_gross * v_cfg.team_pct / 100.0),
    'eco_cents',  round(v_gross * v_cfg.eco_pct  / 100.0),
    'partner', jsonb_build_object(
      'name',          v_p.name,
      'share_pct',     v_p.share_pct,
      'accrued_cents', v_accrued,
      'paid_cents',    v_paid,
      'owed_cents',    v_accrued - v_paid,
      'is_locked',     v_p.is_locked,
      'is_active',     v_p.is_active
    ),
    'payouts', v_payouts
  );
END;
$pp$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION pit_partner_portal(BIGINT) TO service_role;

SELECT '✅ Partner logins ready — partner_accounts + pit_partner_portal().' AS status;
