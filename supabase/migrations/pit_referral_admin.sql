-- ════════════════════════════════════════════════════════════════════
-- REFERRALS — admin read model.
-- Totals + top referrers (direct-referral count and L1/L2 Spins earned) +
-- recent commission receipts. Handles resolve the same way as the
-- leaderboard: display_name only if show_name is on, else ape_xxxxxx.
-- Read-only. Run in Supabase SQL Editor; safe to re-run.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION pit_referral_admin() RETURNS JSONB AS $fn$
DECLARE
  v_cfg              JSONB;
  v_l1               NUMERIC;
  v_l2               NUMERIC;
  v_total_referred   INT;
  v_active_referrers INT;
  v_total_spins      BIGINT;
  v_top              JSONB;
  v_recent           JSONB;
BEGIN
  SELECT value::jsonb INTO v_cfg FROM app_settings WHERE key = 'pit_config';
  v_l1 := COALESCE((v_cfg->>'referral_l1_pct')::numeric, 0.20);
  v_l2 := COALESCE((v_cfg->>'referral_l2_pct')::numeric, 0.05);

  SELECT count(*)                       INTO v_total_referred   FROM pit_referrals;
  SELECT count(DISTINCT beneficiary_id) INTO v_active_referrers FROM pit_referral_commissions;
  SELECT COALESCE(sum(spins), 0)        INTO v_total_spins      FROM pit_referral_commissions;

  -- Top referrers: each referrer's direct-referral count + L1/L2 Spins earned.
  SELECT COALESCE(jsonb_agg(row ORDER BY rc DESC, ts DESC), '[]'::jsonb) INTO v_top FROM (
    SELECT
      r.referral_count AS rc,
      (COALESCE(c.l1_spins, 0) + COALESCE(c.l2_spins, 0)) AS ts,
      jsonb_build_object(
        'name', CASE WHEN COALESCE(u.show_name, false) AND NULLIF(trim(u.display_name), '') IS NOT NULL
                     THEN u.display_name
                     ELSE 'ape_' || substr(replace(r.uid::text, '-', ''), 1, 6) END,
        'referrals',   r.referral_count,
        'l1_spins',    COALESCE(c.l1_spins, 0),
        'l2_spins',    COALESCE(c.l2_spins, 0),
        'total_spins', COALESCE(c.l1_spins, 0) + COALESCE(c.l2_spins, 0)
      ) AS row
    FROM (
      SELECT referrer_id AS uid, count(*) AS referral_count
      FROM pit_referrals GROUP BY referrer_id
    ) r
    LEFT JOIN (
      SELECT beneficiary_id AS uid,
             sum(spins) FILTER (WHERE level = 1) AS l1_spins,
             sum(spins) FILTER (WHERE level = 2) AS l2_spins
      FROM pit_referral_commissions GROUP BY beneficiary_id
    ) c ON c.uid = r.uid
    LEFT JOIN users u ON u.id = r.uid
    ORDER BY r.referral_count DESC, ts DESC
    LIMIT 50
  ) t;

  -- Recent commission receipts.
  SELECT COALESCE(jsonb_agg(row ORDER BY ord DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT
      cm.created_at AS ord,
      jsonb_build_object(
        'level',      cm.level,
        'spins',      cm.spins,
        'created_at', cm.created_at,
        'beneficiary', CASE WHEN COALESCE(ub.show_name, false) AND NULLIF(trim(ub.display_name), '') IS NOT NULL
                            THEN ub.display_name
                            ELSE 'ape_' || substr(replace(cm.beneficiary_id::text, '-', ''), 1, 6) END,
        'source', CASE WHEN COALESCE(us.show_name, false) AND NULLIF(trim(us.display_name), '') IS NOT NULL
                       THEN us.display_name
                       ELSE 'ape_' || substr(replace(cm.source_user_id::text, '-', ''), 1, 6) END
      ) AS row
    FROM pit_referral_commissions cm
    LEFT JOIN users ub ON ub.id = cm.beneficiary_id
    LEFT JOIN users us ON us.id = cm.source_user_id
    ORDER BY cm.created_at DESC
    LIMIT 25
  ) rec;

  RETURN jsonb_build_object(
    'l1_pct', v_l1,
    'l2_pct', v_l2,
    'total_referred', v_total_referred,
    'active_referrers', v_active_referrers,
    'total_commission_spins', v_total_spins,
    'top_referrers', v_top,
    'recent', v_recent
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION pit_referral_admin() TO service_role;

SELECT '✅ Referrals admin read model ready — pit_referral_admin().' AS status;
