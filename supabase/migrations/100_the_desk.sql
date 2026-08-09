-- ============================================================================
-- 100_the_desk.sql
--
-- THE WARD, RUN FROM ONE PAGE.
--
-- What changes:
--   * ONE dose target for every song on the ward, held in ward_config and
--     pushed onto every live prescription. No per song target to remember.
--   * A song goes on the ward by being switched on. The therapist row is
--     resolved from the track's own artist, and created if it does not exist,
--     so there is nothing to hire and no name list to keep in step. The
--     "songs match no artist" problem cannot happen because nothing is being
--     matched: the artist on the track IS the artist.
--   * AUTOMATIC RETIREMENT. Reaching the target moves a song to the archive
--     by itself and walks the top of the queue onto the ward, inside the same
--     transaction as the Dose that did it. The manual button is an override,
--     not the mechanism.
--   * A QUEUE with a real order.
--
-- Nothing changes about how tracks are added. Bunny, then Tracks, exactly as
-- now.
--
-- Safe to run twice.
-- ============================================================================


-- ── 1. THE QUEUE ORDER ───────────────────────────────────────────────────
ALTER TABLE public.ward_prescriptions
  ADD COLUMN IF NOT EXISTS queue_pos integer;

CREATE INDEX IF NOT EXISTS ward_prescriptions_queue_idx
  ON public.ward_prescriptions (queue_pos)
  WHERE status = 'classified';


-- ── 2. ONE TARGET FOR EVERYTHING ─────────────────────────────────────────
-- Saved once, pushed onto every song that is live. A song already past the
-- new number retires on its next Dose rather than being yanked mid sentence.
CREATE OR REPLACE FUNCTION public.ward_set_target(p_target integer, p_pct integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer := GREATEST(1, COALESCE(p_target, 10000));
  v_pct    integer := CASE WHEN p_pct IS NULL THEN NULL ELSE LEAST(100, GREATEST(10, p_pct)) END;
  v_cfg    jsonb;
  v_live   integer;
BEGIN
  SELECT COALESCE(value::jsonb, '{}'::jsonb) INTO v_cfg
    FROM public.app_settings WHERE key = 'ward_config';

  v_cfg := COALESCE(v_cfg, '{}'::jsonb) || jsonb_build_object('dose_target', v_target);
  IF v_pct IS NOT NULL THEN
    v_cfg := v_cfg || jsonb_build_object('dose_pct', v_pct);
  END IF;

  INSERT INTO public.app_settings (key, value) VALUES ('ward_config', v_cfg::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  UPDATE public.ward_prescriptions
     SET dose_target = v_target, qualified_pct = NULL
   WHERE status IN ('current', 'breached');
  GET DIAGNOSTICS v_live = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'target', v_target, 'pct', v_pct, 'applied', v_live);
END $$;


-- ── 3. THE ARTIST BEHIND A TRACK ─────────────────────────────────────────
-- Resolved from the track itself and created on the spot if this is the first
-- time that artist has had a song on the ward. Nothing to hire, nothing to
-- keep in step, nothing to spell the same way twice.
CREATE OR REPLACE FUNCTION public.ward_therapist_for(p_track integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_img  text;
  v_id   integer;
BEGIN
  SELECT btrim(artist) INTO v_name FROM public.tracks WHERE id = p_track;
  IF v_name IS NULL OR v_name = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM public.ward_therapists
   WHERE lower(btrim(name)) = lower(v_name) LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- The picture belongs to the artist record, same as everywhere else.
  SELECT image INTO v_img FROM public.artists
   WHERE lower(btrim(name)) = lower(v_name) LIMIT 1;

  INSERT INTO public.ward_therapists (name, bio, image, sort, active, featured)
  VALUES (v_name, '', COALESCE(v_img, ''), 100, true, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;


-- ── 3b. MOVING A PRESCRIPTION TO THE RIGHT ARTIST ────────────────────────
-- There is a unique constraint on (therapist, sequence), so a prescription
-- that changes hands needs a free number under its new artist. Re-using the
-- old one collides, which is exactly what happens when a track's artist is
-- corrected in Tracks after the song has been on the ward.
CREATE OR REPLACE FUNCTION public.ward_reseat(p_prescription integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track integer;
  v_now   integer;
  v_want  integer;
  v_seq   integer;
BEGIN
  SELECT track_id, therapist_id INTO v_track, v_now
    FROM public.ward_prescriptions WHERE id = p_prescription;
  IF v_track IS NULL THEN RETURN NULL; END IF;

  v_want := public.ward_therapist_for(v_track);
  IF v_want IS NULL OR v_want = v_now THEN RETURN v_now; END IF;

  SELECT COALESCE(max(seq), 0) + 1 INTO v_seq
    FROM public.ward_prescriptions WHERE therapist_id = v_want;

  UPDATE public.ward_prescriptions
     SET therapist_id = v_want, seq = v_seq
   WHERE id = p_prescription;

  RETURN v_want;
END $$;


-- ── 4. SWITCHING A SONG ON ───────────────────────────────────────────────
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
BEGIN
  IF p_track IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ward_publish'));

  v_th := public.ward_therapist_for(p_track);
  IF v_th IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'track_has_no_artist');
  END IF;

  SELECT GREATEST(1, COALESCE((value::jsonb->>'dose_target')::integer, 10000))
    INTO v_target FROM public.app_settings WHERE key = 'ward_config';

  SELECT id INTO v_id FROM public.ward_prescriptions WHERE track_id = p_track;

  IF v_id IS NULL THEN
    SELECT COALESCE(max(seq), 0) + 1 INTO v_seq
      FROM public.ward_prescriptions WHERE therapist_id = v_th;

    INSERT INTO public.ward_prescriptions
      (therapist_id, track_id, seq, line, status, dose_target, published_at, unlocked_at)
    VALUES
      (v_th, p_track, v_seq, COALESCE(p_line, ''), 'current', v_target, now(), now())
    RETURNING id INTO v_id;
  ELSE
    -- Coming back from the archive keeps the doses it already earned. That is
    -- history, not something to reset behind somebody's back.
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

  -- The ward always has one in focus.
  UPDATE public.ward_prescriptions
     SET featured = true
   WHERE id = v_id AND NOT EXISTS (SELECT 1 FROM public.ward_prescriptions WHERE featured);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'therapist', v_th);
END $$;


-- ── 5. SWITCHING A SONG OFF, AND THE AUTOMATIC VERSION ───────────────────
-- Off the ward means into the archive, where it still plays. If it was the one
-- in focus, focus moves on. If a queue exists, the top of it walks on.
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

    SELECT id INTO v_next FROM public.ward_prescriptions
     WHERE status = 'classified'
     ORDER BY queue_pos NULLS LAST, seq, id
     LIMIT 1 FOR UPDATE;

    IF v_next IS NOT NULL THEN
      -- The artist is re-read from the track on the way in. A prescription can
      -- carry a stale one from an earlier life, and the app groups by it.
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

  -- Focus never goes missing.
  IF v_featured THEN
    UPDATE public.ward_prescriptions
       SET featured = true
     WHERE id = (SELECT id FROM public.ward_prescriptions
                  WHERE status IN ('current', 'breached') ORDER BY sort, seq, id LIMIT 1);
  END IF;

  RETURN jsonb_build_object('ok', true, 'archived', v_id, 'promoted', v_promoted);
END $$;


-- ── 6. THE LINE UNDER THE TITLE ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ward_song_line(p_track integer, p_line text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ward_prescriptions SET line = COALESCE(p_line, '') WHERE track_id = p_track;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_on_ward');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ── 7. THE QUEUE ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ward_queue_add(p_track integer, p_line text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_th  integer;
  v_id  integer;
  v_pos integer;
  v_seq integer;
BEGIN
  v_th := public.ward_therapist_for(p_track);
  IF v_th IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'track_has_no_artist');
  END IF;

  SELECT COALESCE(max(queue_pos), 0) + 1 INTO v_pos
    FROM public.ward_prescriptions WHERE status = 'classified';

  SELECT id INTO v_id FROM public.ward_prescriptions WHERE track_id = p_track;

  IF v_id IS NULL THEN
    SELECT COALESCE(max(seq), 0) + 1 INTO v_seq
      FROM public.ward_prescriptions WHERE therapist_id = v_th;
    INSERT INTO public.ward_prescriptions
      (therapist_id, track_id, seq, line, status, queue_pos)
    VALUES (v_th, p_track, v_seq, COALESCE(p_line, ''), 'classified', v_pos)
    RETURNING id INTO v_id;
  ELSE
    PERFORM public.ward_reseat(v_id);

    UPDATE public.ward_prescriptions
       SET status = 'classified', queue_pos = v_pos, featured = false,
           archived_at = NULL, breached_at = NULL,
           line = COALESCE(p_line, line)
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'pos', v_pos);
END $$;

CREATE OR REPLACE FUNCTION public.ward_queue_move(p_prescription integer, p_up boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos   integer;
  v_other integer;
  v_opos  integer;
BEGIN
  SELECT queue_pos INTO v_pos FROM public.ward_prescriptions
   WHERE id = p_prescription AND status = 'classified';
  IF v_pos IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_queued');
  END IF;

  IF p_up THEN
    SELECT id, queue_pos INTO v_other, v_opos FROM public.ward_prescriptions
     WHERE status = 'classified' AND queue_pos < v_pos ORDER BY queue_pos DESC LIMIT 1;
  ELSE
    SELECT id, queue_pos INTO v_other, v_opos FROM public.ward_prescriptions
     WHERE status = 'classified' AND queue_pos > v_pos ORDER BY queue_pos LIMIT 1;
  END IF;

  IF v_other IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'moved', false);
  END IF;

  UPDATE public.ward_prescriptions SET queue_pos = v_opos WHERE id = p_prescription;
  UPDATE public.ward_prescriptions SET queue_pos = v_pos  WHERE id = v_other;

  RETURN jsonb_build_object('ok', true, 'moved', true);
END $$;


-- ── 8. THE DOSE THAT RETIRES A SONG ──────────────────────────────────────
-- Same as before up to the target. At the target the song now archives itself
-- and the top of the queue walks on, in the same transaction as the Dose. The
-- button on the desk is an override, not the mechanism.
CREATE OR REPLACE FUNCTION public.ward_dose_record(
  p_user    uuid,
  p_session uuid,
  p_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg      jsonb;
  v_pct      integer;
  v_every    integer;
  v_reward   integer;
  v_row      public.ward_sessions%ROWTYPE;
  v_rx       public.ward_prescriptions%ROWTYPE;
  v_duration integer;
  v_need     integer;
  v_elapsed  integer;
  v_name     text;
  v_total    bigint;
  v_you      bigint;
  v_lifetime bigint;
  v_retired  boolean := false;
  v_swap     jsonb := NULL;
  v_high     integer;
  v_reached  integer;
  v_refill   integer := 0;
  v_balance  bigint;
BEGIN
  IF p_user IS NULL OR p_session IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'bad_request');
  END IF;

  SELECT value::jsonb INTO v_cfg FROM public.app_settings WHERE key = 'ward_config';
  v_pct    := LEAST(100, GREATEST(10, COALESCE((v_cfg->>'dose_pct')::integer, 80)));
  v_every  := GREATEST(1, COALESCE((v_cfg->>'refill_every')::integer, 25));
  v_reward := GREATEST(0, COALESCE((v_cfg->>'refill_spins')::integer, 5));

  SELECT * INTO v_row FROM public.ward_sessions
   WHERE id = p_session AND user_id = p_user FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'no_session');
  END IF;
  IF v_row.dosed_at IS NOT NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'already_dosed');
  END IF;
  IF v_row.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'refunded');
  END IF;

  SELECT * INTO v_rx FROM public.ward_prescriptions
   WHERE track_id = v_row.track_id
     AND status IN ('current', 'breached', 'archived')
   FOR UPDATE;

  IF v_rx.id IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'not_on_ward');
  END IF;

  SELECT COALESCE(tr.duration, 0), t.name INTO v_duration, v_name
    FROM public.tracks tr
    LEFT JOIN public.ward_therapists t ON t.id = v_rx.therapist_id
   WHERE tr.id = v_row.track_id;

  v_pct  := LEAST(100, GREATEST(10, COALESCE(v_rx.qualified_pct, v_pct)));
  v_need := GREATEST(30, floor(COALESCE(v_duration, 0) * v_pct / 100.0)::integer);
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_row.opened_at))::integer);

  IF COALESCE(p_seconds, 0) < v_need OR v_elapsed < v_need THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'too_short', 'need', v_need);
  END IF;

  INSERT INTO public.ward_doses (user_id, track_id) VALUES (p_user, v_row.track_id);
  UPDATE public.ward_sessions SET dosed_at = now() WHERE id = v_row.id;

  UPDATE public.ward_prescriptions
     SET dose_total = dose_total + 1
   WHERE id = v_rx.id
   RETURNING dose_total INTO v_total;

  -- THE TARGET. It retires itself, and the queue moves up.
  IF v_rx.status = 'current' AND v_total >= v_rx.dose_target THEN
    v_swap := public.ward_song_off(v_row.track_id, true);
    v_retired := COALESCE((v_swap->>'ok')::boolean, false);
  END IF;

  INSERT INTO public.ward_spin_state (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.ward_spin_state
     SET lifetime_doses = lifetime_doses + 1, updated_at = now()
   WHERE user_id = p_user
   RETURNING lifetime_doses, refill_high INTO v_lifetime, v_high;

  SELECT count(*) INTO v_you
    FROM public.ward_doses WHERE user_id = p_user AND track_id = v_row.track_id;

  v_high := COALESCE(v_high, 0);
  v_reached := ((v_lifetime / v_every) * v_every)::integer;

  IF v_reached > v_high THEN
    IF v_reward > 0 THEN
      v_refill := ((v_reached - v_high) / v_every) * v_reward;
      INSERT INTO public.pit_ammo_balances (user_id, balance)
      VALUES (p_user, v_refill)
      ON CONFLICT (user_id) DO UPDATE
        SET balance = public.pit_ammo_balances.balance + EXCLUDED.balance, updated_at = now();
    END IF;
    UPDATE public.ward_spin_state SET refill_high = v_reached, updated_at = now()
     WHERE user_id = p_user;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.pit_ammo_balances WHERE user_id = p_user;

  RETURN jsonb_build_object(
    'counted', true,
    'source', v_row.source,
    'prescriptionId', v_rx.id,
    'seq', v_rx.seq,
    'therapistId', v_rx.therapist_id,
    'therapistName', COALESCE(v_name, ''),
    'wardDoses', LEAST(v_total, v_rx.dose_target::bigint),
    'wardTarget', v_rx.dose_target,
    'youPrescription', v_you,
    'youLifetime', v_lifetime,
    'spins', COALESCE(v_balance, 0),
    'refill', v_refill,
    'refillDone', v_lifetime - v_reached,
    'refillEvery', v_every,
    -- The app announces DOSAGE LIMIT BREACHED on this, then refreshes and
    -- finds the ward has already moved on.
    'breached', v_retired,
    'retired', v_retired,
    'replacedBy', v_swap->'promoted',
    'therapistDoses', v_total,
    'youTherapist', v_you,
    'unlocked', false,
    'unlockedSeq', NULL
  );
END $$;


-- ── 9. THE DESK, IN ONE READ ─────────────────────────────────────────────
-- Every artist with every one of their songs, straight from the tracks table,
-- plus what is live and what is queued. Nothing is matched by name, so the
-- "songs match no artist" list has nothing to report and is gone.
CREATE OR REPLACE FUNCTION public.ward_desk()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT COALESCE((SELECT value::jsonb FROM public.app_settings WHERE key = 'ward_config'), '{}'::jsonb) AS j
  ),
  rx AS (
    SELECT p.*, tr.title, tr.artist, tr.cover, tr.duration
      FROM public.ward_prescriptions p
      JOIN public.tracks tr ON tr.id = p.track_id
  )
  SELECT jsonb_build_object(
    'target', GREATEST(1, COALESCE(((SELECT j FROM cfg)->>'dose_target')::integer, 10000)),
    'pct', LEAST(100, GREATEST(10, COALESCE(((SELECT j FROM cfg)->>'dose_pct')::integer, 80))),

    'live', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'trackId', r.track_id, 'title', btrim(r.title), 'artist', btrim(r.artist),
               'cover', COALESCE(r.cover, ''), 'line', COALESCE(r.line, ''),
               'featured', r.featured, 'status', r.status,
               'doses', r.dose_total, 'target', r.dose_target
             ) ORDER BY r.featured DESC, btrim(r.artist), r.seq)
        FROM rx r WHERE r.status IN ('current', 'breached')
    ), '[]'::jsonb),

    'queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'trackId', r.track_id, 'title', btrim(r.title), 'artist', btrim(r.artist),
               'cover', COALESCE(r.cover, ''), 'pos', r.queue_pos
             ) ORDER BY r.queue_pos NULLS LAST, r.id)
        FROM rx r WHERE r.status = 'classified'
    ), '[]'::jsonb),

    'archive', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'trackId', r.track_id, 'title', btrim(r.title), 'artist', btrim(r.artist),
               'cover', COALESCE(r.cover, ''), 'doses', r.dose_total, 'archivedAt', r.archived_at
             ) ORDER BY r.archived_at DESC NULLS LAST, r.id DESC)
        FROM rx r WHERE r.status = 'archived'
    ), '[]'::jsonb),

    -- The catalogue, built from the tracks themselves.
    'artists', COALESCE((
      SELECT jsonb_agg(a ORDER BY a->>'name')
        FROM (
          SELECT jsonb_build_object(
                   'name', btrim(t.artist),
                   -- The picture belongs to the artist record. Grouped on, not
                   -- looked up per row, or Postgres rightly refuses it.
                   -- The artist's own picture, and if they have not got one
                   -- yet, one of their covers rather than an empty square.
                   'image', COALESCE(NULLIF(max(ar.image), ''), max(t.cover), ''),
                   'songs', jsonb_agg(jsonb_build_object(
                     'trackId', t.id,
                     'title', btrim(t.title),
                     'duration', COALESCE(t.duration, 0),
                     'cover', COALESCE(t.cover, ''),
                     'state', COALESCE((SELECT p.status FROM public.ward_prescriptions p
                                         WHERE p.track_id = t.id), 'off'),
                     'line', COALESCE((SELECT p.line FROM public.ward_prescriptions p
                                        WHERE p.track_id = t.id), ''),
                     'doses', COALESCE((SELECT p.dose_total FROM public.ward_prescriptions p
                                         WHERE p.track_id = t.id), 0)
                   ) ORDER BY btrim(t.title))
                 ) AS a
            FROM public.tracks t
            LEFT JOIN public.artists ar
              ON lower(btrim(ar.name)) = lower(btrim(t.artist))
           WHERE t.is_active AND btrim(COALESCE(t.artist, '')) <> ''
           GROUP BY btrim(t.artist)
        ) rows
    ), '[]'::jsonb)
  );
$$;


SELECT '100 ready. One target, songs switch on, the target retires them, the queue moves up.' AS status;
