-- ============================================================================
-- 108_payment_rails.sql
--
-- USDC ALONGSIDE $PUMP, AND A BONUS FOR PAYING IN THE TOKEN.
--
-- Two things are being added:
--
--   * a second currency, so somebody who will not touch a memecoin can still
--     pay, which removes the last excuse
--   * a percentage bonus on every pack when they pay in the token instead,
--     which costs margin rather than cash and gives a real reason to hold it
--
-- The bonus stacks ON TOP of whatever bonus the pack already carries. Buy the
-- five pack and its own bonus applies first, then the token bonus on the
-- total.
--
-- Both live in settings, so a change is a field on the desk, never a redeploy.
--
-- Safe to run twice.
-- ============================================================================

INSERT INTO public.app_settings (key, value) VALUES
  ('pay_currencies', '["PUMP","USDC"]'),
  ('token_bonus_pct', '10'),
  ('usdc_mint',      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  ('usdc_decimals',  '6')
ON CONFLICT (key) DO NOTHING;


-- What a pack costs and what it pays out, in one place, so the app and the
-- desk can never disagree about a price.
CREATE OR REPLACE FUNCTION public.ward_pay_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'currencies', COALESCE(
      (SELECT value::jsonb FROM public.app_settings WHERE key = 'pay_currencies'),
      '["PUMP","USDC"]'::jsonb),
    'tokenBonusPct', GREATEST(0, LEAST(100, COALESCE(
      (SELECT value::integer FROM public.app_settings WHERE key = 'token_bonus_pct'), 10))),
    'token', jsonb_build_object(
      'symbol',   COALESCE((SELECT value FROM public.app_settings WHERE key = 'onus_symbol'), 'PUMP'),
      'mint',     (SELECT value FROM public.app_settings WHERE key = 'onus_mint'),
      'decimals', COALESCE((SELECT value::integer FROM public.app_settings WHERE key = 'onus_decimals'), 6)),
    'usdc', jsonb_build_object(
      'symbol',   'USDC',
      'mint',     COALESCE((SELECT value FROM public.app_settings WHERE key = 'usdc_mint'),
                           'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      'decimals', COALESCE((SELECT value::integer FROM public.app_settings WHERE key = 'usdc_decimals'), 6))
  );
$$;


-- The Spins a purchase actually pays out. One function, so the bonus can never
-- be worked out one way in the app and another way on the desk.
CREATE OR REPLACE FUNCTION public.ward_pack_spins(p_base integer, p_currency text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN upper(COALESCE(p_currency, '')) = 'USDC' THEN GREATEST(0, COALESCE(p_base, 0))
    ELSE GREATEST(0, COALESCE(p_base, 0))
       + floor(GREATEST(0, COALESCE(p_base, 0))
             * GREATEST(0, LEAST(100, COALESCE(
                 (SELECT value::integer FROM public.app_settings WHERE key = 'token_bonus_pct'), 10)))
             / 100.0)::integer
  END;
$$;

GRANT EXECUTE ON FUNCTION public.ward_pay_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.ward_pack_spins(integer, text) TO service_role;

SELECT '108 ready. Two rails, and the token pays more.' AS status;
