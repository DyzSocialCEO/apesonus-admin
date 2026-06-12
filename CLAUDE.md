# APESONUS / "The Floor" — ADMIN repo guide

This is the admin panel. Read this fully before doing anything. It carries every
decision made so far so you do not get lost or undo finished work.

## What this is
APESONUS is a music app, "A Ledger of Feelings," framed as "The Crypto Memory
Arcade, an immutable ledger of vibes." The game is **The Floor**: seven artist
factions, players stream tracks, burning Ammo builds Node Power on that artist,
and each week a pool pays out to Node holders. This repo is the operator console
behind it: catalog, users, Ammo, the prize desk, analytics.

Founder: Bossgee (GitHub DyzSocialCEO), solo, based in Gaborone, Botswana.

Gambling license: a Curaçao license is real and in hand. Do NOT ship any
real-money loss mechanic without confirming the license covers that exact
mechanic. The current payout model (pool funded by house/sponsor money, players
never lose their own money) is fine to build live now.

## Repos, branches, deploy — GOLDEN RULES
- This repo: `apesonus-admin` (github.com/DyzSocialCEO/apesonus-admin). The console.
- Sister repo: `apesonus-pwa` (github.com/DyzSocialCEO/apesonus-pwa). The player app.
  It SHARES THE SAME SUPABASE DATABASE and OWNS the schema. This repo reads and
  writes that shared database but does not own migrations; schema changes belong
  to the PWA side.
- ALWAYS work on branch `onus-pivot`. NEVER touch `main`. `main` is live at
  devrepo.apesonus.com (the PWA live site is music.apesonus.com). We merge to main
  deliberately, only when ready.
- Railway deploys the preview from `onus-pivot`. Live deploys from `main`.
- Mirror rule: any app change with an admin side must be mirrored here in the same
  pass, and vice versa. The two repos stay in sync.
- Show changes before committing. Commit to `onus-pivot`. Never push to `main`.

## The locked economy (the whole model — do not drift from this)
- **Ammo** is an off-chain play credit bought with money (USDC). 1 Ammo = 1
  qualified play. A number in the database, never a token, never transferable,
  sellable, or refunded.
- **Packs** are admin-configured (price + Ammo), stored in `pit_config.ammo_packs`,
  managed on the Ammo page. NOT hardcoded.
- **Money split**: every dollar charged splits at purchase. `treasury_pct`
  (default 70) into the weekly pool, the rest to the house. Banked in real dollars
  on confirmed purchase, frozen onto each record so changing the dial never
  rewrites old sales.
- **Node Power** builds per ARTIST when Ammo burns on that artist's tracks. Grows
  with play, decays when quiet.
- **Weekly payout formula (LOCKED, exact):**
  1. Pool = `treasury_pct`% of money taken that week (confirmed purchases only).
  2. Pool splits across artists by each artist's share of the week's plays.
  3. Each artist's slice splits across that artist's Node holders by their share
     of that artist's Node Power.
  Three steps, each a clean percentage of the one above, totalling to the pool
  with no rounding leaks. The payout tool must show the full worked breakdown to
  the cent before any money moves.
- Sponsor and house seed money fund the actual cash that pays the pool. Revenue
  sizes the obligation; sponsor/house money pays it.
- **Embers** = permanent loyalty ledger, drives a future airdrop. Not a token.
- **$ONUS** = separate on-chain token (Token-2022, 5% transfer fee). NOT used for
  settlement (no utility yet, would die). Settlement is USDC. Do not route payouts
  through it.
- NEVER "stake to lose" framing. The pool is house/sponsor money, never player fees.
- **REVENUE IS SECRET.** Money totals, pool size, house take, and revenue are
  admin-only and shown to sponsors. They must NEVER reach any player-facing surface.
  Players see Nodes, plays, standings, streaks, and their own winnings only.

## Current state (admin)
- Ammo page (`app/dashboard/ammo/page.tsx`): has the pack manager (price + Ammo +
  label + active toggle, saved to `pit_config.ammo_packs` via
  `app/api/admin/ammo/config/route.ts`) and the money-split dial (`treasury_pct`,
  house shown live). Also still has the old daily-free-track picker and the grant
  form.
- Floor Analytics (`app/dashboard/floor-analytics/page.tsx` +
  `app/api/admin/floor-analytics/route.ts`): the economy and game view (money in,
  Ammo sold/granted/spent, Node Power by faction, epoch/purse, 14-day trends,
  top holders). Admin-only, fine to show money here.
- Sidebar: Culture Pulse removed; "The Floor" and "Floor Analytics" present.

## What is next (in order)
1. **Wire packs + split into the live purchase** (cross-repo with the PWA). The
   PWA buy screen reads these admin packs; on confirmed purchase the dollar splits
   `treasury_pct`/house, is banked and frozen onto the record, and pool-vs-house
   shows in admin only. Needs a small SQL table for the split records (paste the
   SQL in chat for the founder to run, do not bury it in files).
2. **Weekly payout engine (this repo).** Reads the pool, plays per artist, Node
   Power per artist, runs the 3-step formula, shows the worked breakdown to the
   cent, produces a collect-and-send batch (every wallet + amount) the founder
   sends at once from their own wallet, records the payouts. Settlement USDC.
3. **Free-Ammo daily drop** (PWA-led): every account gets N free Ammo a day
   (default 5) that earns nothing; bought Ammo earns; block at zero with a popup.
   This retires the daily-free-track picker, so remove it from this Ammo page when
   that lands.

## Admin cleanup audit (decided, not yet done)
- DEAD, remove: Dashboard "Pulse Today" tile (sentiment, gone) and "Genesis
  Holders" tile; the Recent Users "Tier" column (FREE/STANDARD/GENESIS, a
  subscription-era idea) and the $ONUS column. Replace with Ammo holders, paying
  vs free users, and plays.
- Three overlapping analytics surfaces. Give each one job: **Dashboard** = clean
  at-a-glance overview; **Analytics** = music only (Mood Breakdown, Top Tracks,
  listening trends); **Floor Analytics** = money and economy. Remove the duplicate
  user/play tiles and the dead Pulse tile from Analytics.
- **Settings** is almost all dead (subscription pricing, genesis window, SOL/USD
  source + manual pin, yearly bonus CP, admin test mode). Strip to system health +
  receiving wallet + (later) the free-Ammo number. The receiving wallet config key
  is `helius_treasury_wallet` in `app_settings`.
- **Chart** page: cut the unfinished "Forecast (Coming Soon)" panel so the page
  opens on the actual weekly chart.
- **The Record**: KEEP. It is the curated "crypto memory in song" archive, on-brand
  with the arcade / ledger-of-vibes vision. Lean into it later as a front-of-app
  feature.
- **The Floor admin page** (`app/dashboard/pit/page.tsx`): header still says
  "THE PIT", rename to "The Floor". Its weekly-purse desk is the OLD purse model
  and gets superseded by the new payout engine, so do not polish it, replace it.
- DELETE the dead page files and their API routes: `dashboard/arena-analytics`,
  `dashboard/arenas`, `dashboard/danger`, `dashboard/pulse`, and the matching
  `api/admin/arena-analytics`, `api/admin/arenas`, `api/admin/danger`,
  `api/admin/pulse`.

## Key schema / infra (shared DB)
- `pit_config` is a JSON-in-TEXT row in `app_settings` (key = `pit_config`),
  read-modify-write. Holds `ammo_packs`, `treasury_pct`, and the legacy
  `featured_track_id` / `free_daily_plays`.
- Ammo tables: `pit_ammo_balances`, `pit_ammo_purchases` (reference UNIQUE,
  tx_signature UNIQUE, status pending/confirmed/failed/expired, ammo_amount,
  usd_cents, paid_usdc_base, confirmed_at), `pit_ammo_grants`.
- `pit_confirm_purchase(reference, tx_signature, paid_usdc_base)` = idempotent
  credit. `pit_grant_ammo(user, amount, reason, actor)` = admin grant.
- `pit_nodes`, `pit_qualified_plays` (source ammo/free_daily), `pit_artist_stats`,
  `pit_epochs`, `pit_payouts`.
- Admin client: `createAdminClient()` from `@/lib/supabase` (async, await it).
  Session: `getSession()` from `@/lib/auth`. Audit: `logAdminAction(supabase,
  request, session.username, action, details)` from `@/lib/admin-audit`.
- Receiving wallet (public): `AT1LfjYZKzJkyYP6iMdM5NdD8RfBF1PmxZ268C2JPB9c`,
  config key `helius_treasury_wallet`. The sending/payout wallet stays on the
  founder's side, its key NEVER in code or chat.
- Mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Audio on Bunny CDN.
- 7 artist slugs: chartnobyl-bro, coinalisa, lola-likwidity, mcbagholder,
  dj-dustwallet, shilliam-dafoe, satosheek.

## Brand
- Brand color #c6ff2e (acid lime); admin accents use `text-primary`. Money color
  #ffc847 gold. Background dark (#0a0a0f family, gray-900/gray-800 cards). Charts
  use recharts. Faction colors: chartnobyl-bro #c6ff2e, lola-likwidity #ff2e7e,
  mcbagholder #ffc847, coinalisa #5ac8fa, dj-dustwallet #a855f7, shilliam-dafoe
  #ff8a3d, satosheek #7af5c0.

## Conventions / rules
- Verify every import against the real repo before writing code.
- Syntax-check before committing (next build / tsc, or esbuild on changed files).
- SQL: paste it in chat for the founder to run in Supabase. Do NOT bury SQL only in
  files. The Supabase SQL editor chokes on `$$` dollar-quoting, so use named tags
  like `$fn$` and run function blocks on their own with nothing highlighted.
- Copy and writing style: no dashes (hyphenated compounds are fine). No "not X but
  Y." No three-beat lists. No rhetorical question-and-answer. Avoid "genuinely,"
  "honestly," "actually." Plain, human, punchy. The voice is the arcade, not a bank.
- Premium aesthetics always. Strong decisions, minimal questions.
