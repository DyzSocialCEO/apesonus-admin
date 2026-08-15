-- ============================================================================
-- 116_session_settings.sql
--
-- THE PRIVATE SESSION, ITS NUMBERS.
--
-- One app_settings row, read by the desk and later by the booking screen and
-- the buy route. Nothing about the session is written into code: the price,
-- the daily capacity, the estimate and the open switch all live here.
--
--   price_cents        what one session costs. Both rails derive from it.
--   capacity_per_day   how many cases can be opened in a clinic day.
--   estimate_minutes   what the waiting room counts down from.
--   booking_open       the master switch. Ships CLOSED.
--
-- It ships closed on purpose. There is no booking screen yet, so nothing can
-- take money by accident while the flow is being built.
--
-- Safe to run twice: an existing row keeps every value already edited and
-- only gains keys it is missing.
-- ============================================================================

INSERT INTO public.app_settings (key, value)
SELECT 'session_config',
       '{"price_cents":200,"capacity_per_day":10,"estimate_minutes":120,"booking_open":false}'
 WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'session_config');

UPDATE public.app_settings
   SET value = (jsonb_build_object(
         'price_cents',      200,
         'capacity_per_day', 10,
         'estimate_minutes', 120,
         'booking_open',     false
       ) || value::jsonb)::text
 WHERE key = 'session_config';

-- Check. Read the four values back.
SELECT
  (value::jsonb->>'price_cents')::int      AS price_cents,
  (value::jsonb->>'capacity_per_day')::int AS capacity_per_day,
  (value::jsonb->>'estimate_minutes')::int AS estimate_minutes,
  (value::jsonb->>'booking_open')::boolean AS booking_open
FROM public.app_settings WHERE key = 'session_config';
