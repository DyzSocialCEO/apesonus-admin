# APESONUS — ADMIN repo guide (the operator console)

Read this fully first. Last full rewrite: July 2026. The player app's
CLAUDE.md carries the product truth (two skill games: Call = Conviction
trading competition, Back = cosign artist backing; NO draws anywhere; the
Reveal tab shows Back results and its route stays /draw for legacy links;
Golden Tickets retired). This file covers the console's own rules.

## What this repo is
Operator console for APESONUS: catalog, users, Spins economy, the
Conviction Desk, the Backing Desk, payouts, revenue, distribution,
referrals, partner access, logs, settings. SHARES the same Supabase
database as apesonus-pwa. The PWA owns the schema; this repo never ships
migrations. The full schema + every DB function lives in the PWA repo at
supabase/schema/. Read the function before calling it.

## Money rules
- Every confirmed purchase froze its split into pit_revenue_ledger
  (treasury_cents = prize obligation, house_cents = house). A DB trigger
  accrues partner shares per purchase. REVENUE IS SECRET outside admin and
  the anchored public commitment chain.
- Conviction liability is capped per contest at pot_ceiling_usd, frozen at
  creation. The payout wallet holds a working float only; open pot ceilings
  must never exceed it.
- Conviction prizes flow through conviction_payouts (queued -> sent), paid
  manually from lib/solana-payout.ts (submit-first, signature recorded
  before confirmation). PAYOUT_WALLET_SECRET and ONUS_COMMIT_SECRET exist
  ONLY in this repo's env. Never in code, chat, or the PWA.
- Cosign pools are Spins, set on the Backing Desk; the settle is pure math
  with a conservation invariant. Nobody right means the pool stays with
  the house.

## Crons (all on cron-job.org, ?secret=CRON_SECRET, all target THIS app
unless noted)
- /api/cron/anchor: hourly. Play-chain commit.
- /api/cron/revenue-anchor: every 30 min. Revenue books. (Was unscheduled
  until July 2026; keep it scheduled.)
- /api/cron/conviction-feed: every 3 to 5 min. Board feed + call sealer.
- /api/cron/cosign-settle: every 5 min. THE canonical settler; seals
  on-chain. The PWA's settle route is a fallback and is never scheduled.
- /api/pit/cron/reconcile: hourly, on the PWA. Payment backstop.
- Phase 3/4 add: /api/cron/conviction-resolve and /api/cron/conviction-open.

## Console conventions
- Next 14 / React 18, @/* maps to repo root, pages under
  app/dashboard/<x>, sidebar in components/sidebar.tsx, shadcn + Tailwind.
- Auth: getSession() on every admin route, no exceptions. Admin mutations
  write admin_audit_log (append-only).
- UI says Spins; legacy identifiers say ammo. Never rename identifiers.
- Golden Tickets are retired: the Payouts page is becoming the Conviction
  payout queue. pit_golden_*, pit_gt_*, pit_withdrawals, and all Floor /
  Arena / Read / War / markets / CP-era tables are dormant. Exclude them
  from ledgers and UI; do not drop them pre-launch.

## Repos, branches, deploy — GOLDEN RULES
- ALWAYS branch onus-pivot. NEVER touch main (live devrepo.apesonus.com).
  Railway previews deploy from onus-pivot.
- Mirror rule with the PWA: cross-repo changes ship in the same pass.
- npx tsc --noEmit before every push. Confirm via the xxxx..yyyy line.
- SQL is pasted in chat for the founder to run in Supabase (named dollar
  tags like $fn$), then the PWA commits a fresh schema dump.

## Copy rules
Same as the PWA: no dashes as dashes, no "not X but Y", no three-beat
lists, no rhetorical question-and-answer, avoid "genuinely / honestly /
actually". Plain and punchy.
