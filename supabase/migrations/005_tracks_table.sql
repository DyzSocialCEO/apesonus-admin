-- =====================================================
-- STOKMOJI - Migration 005: Tracks Table
-- Move tracks from hardcoded array to database
-- =====================================================

-- Create tracks table
CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  mood TEXT NOT NULL CHECK (mood IN ('moon', 'rekt', 'cope', 'degen', 'zen')),
  cover TEXT NOT NULL,
  audio TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  is_instrumental BOOLEAN DEFAULT FALSE,
  soundbath_category TEXT CHECK (soundbath_category IN ('lofi', 'piano', 'jazz', 'ambient', 'meditation', NULL)),
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  is_editors_choice BOOLEAN DEFAULT FALSE,
  play_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracks_mood ON tracks(mood);
CREATE INDEX IF NOT EXISTS idx_tracks_active ON tracks(is_active);
CREATE INDEX IF NOT EXISTS idx_tracks_instrumental ON tracks(is_instrumental);
CREATE INDEX IF NOT EXISTS idx_tracks_featured ON tracks(is_featured);

-- RLS
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read active tracks" ON tracks
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service can manage tracks" ON tracks
    FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- SEED: Insert existing 10 tracks (preserve original IDs)
-- =====================================================

-- Reset sequence to allow specific IDs
INSERT INTO tracks (id, title, artist, mood, cover, audio, duration, is_active, is_featured, is_editors_choice, sort_order) VALUES

-- MOON
(15, 'To The Moon', 'Chartnobyl Bro', 'moon',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/chartnobyl.png',
  'https://stokmoji-audio.b-cdn.net/music/chartnobyl-bro/to_the_moon.m4a',
  168, TRUE, FALSE, FALSE, 1),

(29, 'Risk Management', 'Down Bad Dave', 'moon',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/downbad_dave.png',
  'https://stokmoji-audio.b-cdn.net/music/down-bad-dave/risk_management.m4a',
  172, TRUE, FALSE, FALSE, 2),

(36, 'Digital Gold Rush', 'Shilliam Dafoe', 'moon',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/shilliam.dafoe.png',
  'https://stokmoji-audio.b-cdn.net/music/shilliam-dafoe/digital_gold_rush.m4a',
  174, TRUE, FALSE, FALSE, 3),

-- REKT
(1, 'Exit Liquidity', 'Lola Likwidity', 'rekt',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/lola_likwidity222.png',
  'https://stokmoji-audio.b-cdn.net/music/lola-likwidity/exit_liquidity.m4a',
  167, TRUE, FALSE, TRUE, 4),

(7, 'Selling Everything', 'Satoshi Deluxe', 'rekt',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/satoshi_deluxe.png',
  'https://stokmoji-audio.b-cdn.net/music/satoshi-deluxe/selling_everything.m4a',
  198, TRUE, FALSE, FALSE, 5),

(13, 'Crypto''s Finest', 'Aunty Rugsy', 'rekt',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/aunty_rugsy.png',
  'https://stokmoji-audio.b-cdn.net/music/aunty-rugsy/cryptos_finest.m4a',
  159, TRUE, FALSE, FALSE, 6),

-- COPE
(5, 'Just One Coin', 'Miss Candlesticker', 'cope',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/miss_candlesticker.png',
  'https://stokmoji-audio.b-cdn.net/music/miss-candlesticker/just_one_coin.m4a',
  172, TRUE, FALSE, FALSE, 7),

(27, 'Why Not Me', 'Coinalisa Murado', 'cope',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/coinalisa_murado.png',
  'https://stokmoji-audio.b-cdn.net/music/coinalisa-murado/why_not_me.m4a',
  164, TRUE, FALSE, FALSE, 8),

(18, 'We Are Gamblers', 'Shill Shady ft. Miss Candlesticker', 'cope',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/shill_shady.png',
  'https://stokmoji-audio.b-cdn.net/music/shill-shady/we_are_gamblers.m4a',
  154, TRUE, FALSE, TRUE, 9),

-- DEGEN
(23, 'Apes Together Strong', 'Shilliam Dafoe', 'degen',
  'https://stokmoji-images.b-cdn.net/images-rekterapy/shilliam.dafoe.png',
  'https://stokmoji-audio.b-cdn.net/music/shilliam-dafoe/apes_together_strong.m4a',
  171, TRUE, FALSE, FALSE, 10);

-- Set the sequence to continue after our highest ID
SELECT setval('tracks_id_seq', (SELECT MAX(id) FROM tracks));

-- RPC to increment track play count
CREATE OR REPLACE FUNCTION increment_track_plays(track_id_input INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE tracks SET play_count = play_count + 1 WHERE id = track_id_input;
END;
$$ LANGUAGE plpgsql;
