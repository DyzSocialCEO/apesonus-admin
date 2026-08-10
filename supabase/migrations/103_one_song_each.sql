-- ============================================================================
-- 103_one_song_each.sql
--
-- ONE SONG PER THERAPIST ON THE WARD.
--
-- The ward draws one tile per therapist and the tile IS the song. A therapist
-- with two songs live has no place to put the second one, so the rule belongs
-- in the database rather than in a button behaving itself.
--
-- A partial unique index does it: at most one live prescription per therapist.
-- Anything trying to break it fails loudly instead of producing a ward the
-- design has no answer for.
--
-- ward_song_on now refuses with a reason the desk can print, rather than
-- throwing a constraint error at somebody.
--
-- Safe to run twice.
-- ============================================================================

-- Before the index can exist, anything already doubled up has to come off.
-- The newest live prescription for each therapist stays; the rest go to the
-- archive, where they are still playable.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY therapist_id
               ORDER BY featured DESC, published_at DESC NULLS LAST, id DESC
             ) AS rn
        FROM public.ward_prescriptions
       WHERE status IN ('current', 'breached')
    ) x WHERE rn > 1
  LOOP
    UPDATE public.ward_prescriptions
       SET status = 'archived', archived_at = now(), featured = false
     WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ward_prescriptions_one_per_therapist
  ON public.ward_prescriptions (therapist_id)
  WHERE status IN ('current', 'breached');


-- ── SWITCHING A SONG ON, WITH THE RULE STATED ────────────────────────────
CREATE OR REPLACE FUNCTION public.ward_song_on(p_track integer, p_line text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_th     integer;
  v_id     integer;
  v_target integer;
  v_seq    integer;
  v_busy   text;
BEGIN
  IF p_track IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ward_publish'));

  v_th := public.ward_therapist_for(p_track);
  IF v_th IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'track_has_no_artist');
  END IF;

  SELECT id INTO v_id FROM public.ward_prescriptions WHERE track_id = p_track;

  -- One song each. If this therapist already has one up, say which, so the
  -- desk can tell him what to retire instead of failing silently.
  SELECT btrim(tr.title) INTO v_busy
    FROM public.ward_prescriptions p
    JOIN public.tracks tr ON tr.id = p.track_id
   WHERE p.therapist_id = v_th
     AND p.status IN ('current', 'breached')
     AND (v_id IS NULL OR p.id <> v_id)
   LIMIT 1;

  IF v_busy IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'therapist_busy', 'song', v_busy);
  END IF;

  SELECT GREATEST(1, COALESCE((value::jsonb->>'dose_target')::integer, 10000))
    INTO v_target FROM public.app_settings WHERE key = 'ward_config';

  IF v_id IS NULL THEN
    SELECT COALESCE(max(seq), 0) + 1 INTO v_seq
      FROM public.ward_prescriptions WHERE therapist_id = v_th;

    INSERT INTO public.ward_prescriptions
      (therapist_id, track_id, seq, line, status, dose_target, published_at, unlocked_at)
    VALUES
      (v_th, p_track, v_seq, COALESCE(p_line, ''), 'current', v_target, now(), now())
    RETURNING id INTO v_id;
  ELSE
    PERFORM public.ward_reseat(v_id);

    UPDATE public.ward_prescriptions
       SET status = 'current',
           dose_target = v_target,
           qualified_pct = NULL,
           queue_pos = NULL,
           archived_at = NULL,
           breached_at = NULL,
           published_at = COALESCE(published_at, now()),
           unlocked_at = COALESCE(unlocked_at, now()),
           line = COALESCE(p_line, line)
     WHERE id = v_id;
  END IF;

  UPDATE public.ward_prescriptions
     SET featured = true
   WHERE id = v_id AND NOT EXISTS (SELECT 1 FROM public.ward_prescriptions WHERE featured);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'therapist', v_th);
END $$;


-- ── AND THE SAME RULE WHEN THE QUEUE PROMOTES SOMEBODY ───────────────────
-- A retiring song frees its therapist, so the queue may only bring on a song
-- whose therapist is free at that moment. Otherwise the promotion would break
-- the index and the whole Dose transaction with it.
CREATE OR REPLACE FUNCTION public.ward_song_off(p_track integer, p_promote boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       integer;
  v_featured boolean;
  v_next     integer;
  v_target   integer;
  v_promoted jsonb := NULL;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ward_publish'));

  SELECT id, featured INTO v_id, v_featured
    FROM public.ward_prescriptions
   WHERE track_id = p_track AND status IN ('current', 'breached')
   FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_on_ward');
  END IF;

  UPDATE public.ward_prescriptions
     SET status = 'archived', archived_at = now(), featured = false, queue_pos = NULL
   WHERE id = v_id;

  IF p_promote THEN
    SELECT GREATEST(1, COALESCE((value::jsonb->>'dose_target')::integer, 10000))
      INTO v_target FROM public.app_settings WHERE key = 'ward_config';

    -- The first queued song whose therapist has nothing live right now.
    SELECT q.id INTO v_next
      FROM public.ward_prescriptions q
     WHERE q.status = 'classified'
       AND NOT EXISTS (
         SELECT 1 FROM public.ward_prescriptions o
          WHERE o.therapist_id = COALESCE(public.ward_therapist_for(q.track_id), q.therapist_id)
            AND o.status IN ('current', 'breached')
       )
     ORDER BY q.queue_pos NULLS LAST, q.seq, q.id
     LIMIT 1
     FOR UPDATE;

    IF v_next IS NOT NULL THEN
      PERFORM public.ward_reseat(v_next);

      UPDATE public.ward_prescriptions
         SET status = 'current',
             dose_target = v_target,
             queue_pos = NULL,
             published_at = COALESCE(published_at, now()),
             unlocked_at = COALESCE(unlocked_at, now())
       WHERE id = v_next;

      SELECT jsonb_build_object('id', p.id, 'title', btrim(tr.title), 'therapist', t.name)
        INTO v_promoted
        FROM public.ward_prescriptions p
        JOIN public.tracks tr ON tr.id = p.track_id
        LEFT JOIN public.ward_therapists t ON t.id = p.therapist_id
       WHERE p.id = v_next;
    END IF;
  END IF;

  IF v_featured THEN
    UPDATE public.ward_prescriptions
       SET featured = true
     WHERE id = (SELECT id FROM public.ward_prescriptions
                  WHERE status IN ('current', 'breached') ORDER BY sort, seq, id LIMIT 1);
  END IF;

  RETURN jsonb_build_object('ok', true, 'archived', v_id, 'promoted', v_promoted);
END $$;

SELECT '103 ready. One song each, and the desk gets told why when it refuses.' AS status;
