-- ============================================================================
-- 117_session_per_patient.sql
--
-- ONE CASE PER PATIENT PER CLINIC DAY.
--
-- The total for the day is a separate number and stays whatever the desk sets
-- it to. This one caps a single patient, because the desk owes a finished song
-- for every case and somebody who can book five in an afternoon fills the
-- queue with whatever came to mind.
--
-- Editable on the Sessions desk. Never hardcoded.
--
-- Safe to run twice: an existing value is kept.
-- ============================================================================

UPDATE public.app_settings
   SET value = (jsonb_build_object('per_patient_per_day', 1) || value::jsonb)::text
 WHERE key = 'session_config';

SELECT
  (value::jsonb->>'price_cents')::int          AS price_cents,
  (value::jsonb->>'capacity_per_day')::int     AS capacity_per_day,
  (value::jsonb->>'per_patient_per_day')::int  AS per_patient_per_day,
  (value::jsonb->>'estimate_minutes')::int     AS estimate_minutes,
  (value::jsonb->>'booking_open')::boolean     AS booking_open
FROM public.app_settings WHERE key = 'session_config';
