# APESONUS REBUILD: THE DOCUMENT

Written 8 August 2026 from `README.md`, `docs/PRODUCT_SPEC.md`, `docs/BACKEND_CONTRACT.md`, the approved
prototype in `apesonus-pwa/` and `assets/approved-ui-reference.png`.

This document is the only build order. Nothing outside it ships. If something is not written here it does
not get built, and if something here turns out to be wrong we change this file first and the code second.

---

## 1. WHAT WE BUILD ON

The prototype is dependency free and keeps its state in `localStorage`. That is a demo, not a product, and
`BACKEND_CONTRACT.md` says so on its first line. So:

- **The prototype is the source of truth for how it looks and how it behaves.** Pixel for pixel, word for word.
- **The live repos are the source of truth for how it runs.** Email auth, the Helius payment rail, Bunny audio
  signing, Supabase with RLS, the Railway deploy. None of that gets thrown away and rebuilt.

Repos (all public, cloned at HEAD before every phase):

| Repo | Path | HEAD when this was written |
|---|---|---|
| `apesonus-pwa` | `~/apesonus/apesonus-pwa` | `6b1f1a6` |
| `apesonus-admin` | `~/apesonus/apesonus-admin` | `e8d8818` |

What already exists and is correct against the new spec, so it is kept and re-pointed rather than rebuilt:

- The Spin ledger path. `pit_ammo_balances`, `ward_sessions`, `ward_spin_take`, `ward_spin_refund`,
  `ward_dose_record`, and the 25-Dose refill with `refill_high` so it cannot pay twice.
- The packs. $1 = 100, $5 = 600, $10 = 1,500 are already the live numbers in `ward_config`.
- The ranks. `lib/clinic/ranks.ts` already holds the exact nine from the spec, 1 through 25,000.
- The purchase rail. `/api/pit/buy` prices from the desk, the Helius webhook confirms on chain and credits in
  one idempotent transaction with the revenue split.
- The Waiting Room rules. 140 characters, one patient number per account, one SAME CONDITION, the
  SEEN BY DR. ONUS pin, hide never deletes.

What changes, and this is the real work:

1. The model goes from **eight therapists with their own targets** to **one active prescription with a shared
   target**. That is a database change, not a screen change.
2. The **daily courtesy treatment** does not exist anywhere yet. It is new.
3. The surface is repainted to the approved board. That is most of the hours.
4. The admin is rebuilt simple, one place per number, with a real financials page.

---

## 2. THE LOCKED MODEL

Vocabulary, and nothing in the app is allowed to speak any other way:

Dr. Onus is the chief doctor and host. A therapist is an artist. A patient is a user. A prescription is a
song. A Dose is a qualified listen. A Spin is a treatment credit. The Morning Dose is Dr. Onus's daily clip.

Launch numbers:

| Thing | Value | Where it is set |
|---|---|---|
| Active prescriptions | 1, always | database status column |
| Launch prescription | Paper Hands, Shim Liquidation | Ward desk |
| Shared target | 10,000 Doses | Ward desk |
| Shared counter starts at | 0 | not seeded, see 6.1 |
| Qualified listen | 80% of duration | Ward desk |
| Courtesy treatments | 1 per patient per day | Ward desk |
| Spin cost per treatment | 1 | Settings |
| Starter Spins | 2 | Settings |
| Refill | +5 Spins every 25 lifetime Doses | Settings |
| Packs | $1/100, $5/600 (+20%), $10/1500 (+50%) | Settings |
| Payment | $PUMP, live amount at checkout | Settings, one mint |
| Tabs | WARD, WAITING ROOM, MY FILE | fixed in code |

Out of scope at launch, and no phase below may quietly add one: the 8 song grid, the 20 artist catalog, a
global artist directory, prediction wagering, prize pools, a house cut, cash rewards, betting, leaderboards,
staking, wallet connect, token price dashboards, a fourth tab.

---

## 3. THE PHASES

One phase per pass. You say go, I build the whole phase, I verify it, I hand you the zip and every command in
one block. You apply and say next. Zips are per phase so nothing is a surprise; at the end everything is
re-cut into one app zip and one admin zip.

### PHASE 1: THE MODEL
**Ships:** `096_launch_model.sql` only. No app code.

- `ward_prescriptions` gains `status` (`classified` | `current` | `archived`), `dose_total`, `dose_target`,
  `qualified_pct`. A partial unique index makes it impossible for two rows to be `current` at once.
- The current Paper Hands row is promoted to `current` with a 10,000 target. Everything else on the ward is
  set `classified` so no title can leak in a network response.
- `ward_spin_state` gains `courtesy_date` and `courtesy_used`.
- `ward_spin_take` rewritten: courtesy first if one is left today, then a Spin, then `no_spins`. It returns
  which one paid, so the screen can say FREE TODAY or 1 SPIN honestly.
- `ward_spin_refund` rewritten to hand back whichever was spent, courtesy included.
- `ward_dose_record` rewritten: one qualified session moves patient lifetime Doses **and** the prescription's
  shared total, settles the refill, and when the target is crossed it archives the current row, promotes the
  lowest classified row, and returns the unlock event exactly once.
- `ward_ward` and `ward_file` rewritten to return the single current prescription and the full My File list.

**Done when:** runs twice clean on Postgres 16, and these are tested live: courtesy pays once a day and rolls
at midnight, a second treatment the same day takes a Spin, a broke patient gets `no_spins` with no session
opened, a dose one second in is refused against the wall clock, 80% counts, the same session cannot dose
twice, both counters move by exactly one, the refill pays once at 25, the unlock fires exactly at target and
the next prescription becomes playable in the same transaction.

### PHASE 2: THE SHELL AND THE VISUAL SYSTEM
**Ships:** `shell-pwa.zip`.

- Tokens lifted from the prototype stylesheet exactly: `#050606`, `#0a0b0d`, `#0e1013`, `#1c2024`, `#9cf400`,
  `#c7ff39`, `#d66aff`, `#5d1d79`, `#ff315f`, `#e6dcc4`, `#8c918c`.
- Fonts Anton, Barlow Condensed, IBM Plex Mono, Courier Prime. Self hosted, not fetched at build time, because
  a Google font fetch failing is what stalled a Railway deploy before.
- The room light, grain, vignette and scanline layers, with the reduced motion escape.
- Desktop sidebar at 232px: wordmark, the two line strapline, patient chip, YOUR SPINS card, three nav rows,
  SETTINGS and SPIN HISTORY, the clinic note at the bottom.
- Mobile: sticky header with the Spins pill, three fixed bottom tabs, the dock sitting above them.
- The intake sequence (see question 1 below).

**Done when:** the shell matches the board at 1440, 1024, 820 and 390 wide, `tsc` clean, build clean.

### PHASE 3: THE WARD
**Ships:** `ward-pwa.zip`.

- MORNING DOSE panel: clip, tape label, play button, the typed quote, the cite, the consultation meta line.
- CURRENT PRESCRIPTION panel: tilting cover with PRESCRIPTION 001 badge, title, therapist, blurb, ACTIVE tag,
  the waveform canvas with the 80% marker and the playhead, the timecodes, the five transport controls, the
  TAKE TREATMENT button with the fill and the honest cost label, the microcopy line.
- The CLASSIFIED paper card: the shared counter, the syringe bar, the remaining line, the CLASSIFIED stamp
  and the lock.
- The five card stat strip and the PREVIOUS PRESCRIPTIONS tease.
- Cinematics: DOSE RECORDED, REFILL ISSUED, DIAGNOSIS UPDATED, DOSAGE LIMIT BREACHED.

The waveform in the prototype is a simulation on a timer. Here it is driven by the real `<audio>` element and
the real signed Bunny URL, and the Dose is recorded by the server against the session, never by the browser
saying so. Pressing play does not credit anything. Pausing does not credit anything.

**Done when:** a real end to end listen on a phone credits one Dose at 80%, both counters move, a second play
takes a second Spin, a failed audio start refunds within seconds, and the counter never renders as a blank
card when a read fails.

### PHASE 4: THE WAITING ROOM
**Ships:** `room-pwa.zip`.

Repainted to the prototype: page title block, the composer with the live 140 counter and the ANONYMOUS label,
the confession cards with their stagger, the SEEN BY DR. ONUS featured card, the SAME CONDITION button.
Server rules are already correct and are not touched.

**Done when:** posting, reacting, the rate limit and the pin all behave, and it matches the board.

### PHASE 5: MY FILE
**Ships:** `file-pwa.zip`.

The paper sheet with the CONFIDENTIAL stamp and the status row, then every cell the spec names: Patient ID,
diagnosis, Spin balance, lifetime Doses, next diagnosis progress, next refill progress, therapists visited
with no denominator, prescriptions taken, most visited therapist, confessions, SAME CONDITION received.
Under it: SPIN PURCHASE HISTORY, SETTINGS, LOG OUT.

Settings holds only switches that do something real: reduce motion, show the Morning Dose, and the clinic
rules panel. Autoplay is meaningless with one prescription and notifications have no delivery, so neither is
drawn as a dead toggle.

**Done when:** every number on the file comes from one server read and matches the ward.

### PHASE 6: THE MONEY
**Ships:** `money-pwa.zip`.

- REFILL THE PRESCRIPTION modal with the three packs, the best pack marked, USD prominent and the $PUMP amount
  shown only at checkout from the live price. No amount is ever computed as a hardcoded rate in the browser.
- PRESCRIPTION EMPTY modal and the QUALIFIED LISTEN RULES panel, both word for word from the board.
- Spin purchase history reading the real ledger: date, pack, Spins credited, bonus, token, token amount,
  status.
- Verification pass on the rail: one webhook credits once, a replay credits nothing, a cancelled intent
  credits nothing, a technical playback failure returns the credit.

**Done when:** a real $1 purchase from your own wallet lands as 100 Spins with one ledger row.

### PHASE 7: THE ADMIN
**Ships:** `admin.zip`.

Rebuilt simple. Every number the app prints has exactly one place it is set, and every switch saves the moment
it is pressed.

- **The Ward:** the current prescription, its target, qualified percent, courtesy per day, today's Morning
  Dose clip and quote.
- **Prescriptions:** the queue. Classified rows in order, the current one, the archive. Promote by hand if you
  ever want to override the automatic unlock.
- **Waiting Room:** confessions, hide, pin.
- **Patients:** account, Spins held, lifetime Doses, diagnosis, purchases, give Spins with a reason.
- **Financials:** revenue by day and by pack, Spins sold, Spins outstanding, Spins given away, refills issued,
  courtesy treatments given, and the cost of the economy as a percentage. Counted in SQL, never by pulling
  rows, because PostgREST caps a response at 1,000 rows and that is how a number silently freezes.
- **Settings:** packs, Spin cost, starter Spins, refill numbers, the mint, the buy link.

**Done when:** changing any number on the desk changes the app with no deploy, and no page pulls unbounded
rows.

### PHASE 8: THE SWEEP AND THE PROOF
**Ships:** the two final zips, `apesonus-pwa-final.zip` and `apesonus-admin-final.zip`.

- Dead code deleted, from a list I show you before I run it. Nothing is deleted the same day it is written.
- False copy sweep. Nothing in the app, the metadata, the manifest or the share cards may describe a feature
  that is not live.
- Em dash sweep, and no AI fingerprints anywhere.
- Scale pass: indexes on every hot read, counters denormalised so the ward never counts rows to draw a number,
  advisory locks on the money path, rate limits on confessions and reactions, idempotency keys on purchase
  crediting and Dose qualification, no client progress trusted anywhere.
- `tsc` clean and a real build on both repos before anything is handed over.

---

## 4. STANDING RULES FOR EVERY PHASE

1. Read the actual file before saying what the code does. Clone your HEAD, never reason from a stale copy.
2. Never call something fixed before it is verified working.
3. No collateral damage. Working systems are not rewritten while something else is being changed.
4. The admin mirrors every app change in the same pass.
5. One block, everything in it, ending in a visible check. No `npx`, `npm` or `node` in your block. There is
   no Node on your Mac; verification is my job in the sandbox.
6. SQL is separate, for the Supabase editor, and is parse tested and behaviour tested on real Postgres first.
7. No em dashes. No AI fingerprints. No hardcoded contract address, ever.
8. Mockup before code on anything visual that is not already in the approved prototype.
9. MEDIA KEEPS ITS SHAPE. Every image and video holds its own aspect ratio at every width. Nothing is
   stretched, squashed or letterboxed with bars. On a phone the artwork and the clip get bigger, not
   distorted, the way a video fills the width on YouTube and keeps its frame.
10. Motion is deliberate. No flicker on load, no layout jumping when a card arrives or leaves, no
   half-drawn frame. Every animation has a reduced motion path and nothing animates a property that
   forces the page to lay out again.

---

## 5. SPEC TRACE

Every line of `PRODUCT_SPEC.md`, and the phase that satisfies it.

| Spec | Phase |
|---|---|
| Canonical vocabulary | 2, 3, 4, 5 |
| One active prescription at a time | 1 |
| Launch: Shim Liquidation, Paper Hands, 10,000 | 1 |
| Do not expose the catalog | 1 (locked rows never travel to the browser) |
| Ward order: Morning Dose, prescription, target, personal strip, archive | 3 |
| 1 daily courtesy treatment | 1, 3 |
| Spin consumed after courtesy is used | 1, 3 |
| Dose at a configurable threshold, 80% | 1, 3 |
| One treatment adds +1 lifetime and +1 community | 1 |
| A failed playback must not consume a Spin | 1, 6 |
| Repeated clicks must not double credit | 1, 3 |
| +5 Spins every 25 Doses, no claim button | 1, 5 |
| Ranks from lifetime Doses only | 5 |
| Waiting Room rules | 4 |
| My File contents | 5 |
| Nothing from the out of scope list | all |
| Backend contract entities | 1, 7 |
| `qualifyTreatment` idempotent, one transaction | 1 |
| Anti-abuse basics | 1, 8 |
| Payment created server side and verified on chain | 6 |

---

## 6. CALLS I MADE WITHOUT ASKING

**6.1 The shared counter starts at 0.** The prototype shows 7,814 of 10,000 because a demo needs to look
alive. Shipping that number would be telling every visitor that 7,814 treatments happened when none did. The
desk gets a field so you can move it if you decide otherwise, but the default is honest.

**6.2 Courtesy doses count toward the shared target,** because the spec says a qualified treatment adds one to
both. Worth knowing: with email accounts and one free Dose a day, ten accounts is ten free Doses a day toward
the 10,000. That is slow enough not to matter at this size, and the guard is that a Dose still costs 80% of a
real listen in real time. If it ever becomes a problem the fix is one switch on the desk, not a redesign.

**6.3 Settings shows only real switches.** No dead toggles.

**6.4 The therapist grid does not come back.** The spec says one prescription and no catalog. Therapists still
exist in the database and MY FILE still counts them, but the ward shows one record.

---

## 7. THE THREE QUESTIONS, ANSWERED AND LOCKED

**1. Intake plays once, straight after the first sign in.** Website, enter ward, email sign in, intake, ward.
Returning patients never see it again. One screen, no carousel, and the copy is his:

    PATIENT INTAKE
    Your condition has been documented.
    1 courtesy treatment every day.
    After that, treatment costs Spins.
    Finish enough of a prescription and it becomes a Dose.
    BEGIN TREATMENT

Intake is where the patient number is born and where they are handed straight to Paper Hands.

**2. The Morning Dose archive is built.** The button reads MORNING DOSE ARCHIVE, never SEE ALL DOSES, because
Dose already means a qualified listen and two meanings for one word is how copy rots. It is a drawer, not a
tab. Cards carry thumbnail, date, title and length.

**3. Nothing swaps itself at 10,000.** The counter stops at the target and the prescription goes to
DOSAGE LIMIT BREACHED, DR. ONUS HAS BEEN NOTIFIED. It stays playable and personal lifetime Doses keep
counting; only the public counter holds. An admin presses publish, the outgoing one moves to the archive, the
incoming one becomes the only thing on the ward, and that press is when its title and its therapist become
public. States: `classified` to `current` to `breached` to `archived`.

### The questions as they were asked

1. **The intake sequence.** The board shows ADMISSION FORM with ADMIT ME and SKIP INTAKE, holding a patient
   number and a diagnosis before anything else. The real app needs an email account before it can know either.
   Which do you want: intake plays first for everyone as the front door and sign in happens when they press
   ADMIT ME, or sign in first and intake plays once after, on the first visit only?

2. **SEE ALL DOSES.** The Morning Dose panel has that button and three carousel dots. Do you want past clips
   browsable, or is it one clip a day and the button comes off?

3. **When the ward hits 10,000.** Do you want prescription 002 already loaded on the desk as classified so the
   swap is instant and automatic, or should the ward hold at DOSAGE LIMIT BREACHED until you press publish?

---

## 8. TICK LIST

- [x] Phase 1: the model. 096_launch_model.sql, run twice clean, behaviour tested on Postgres 16.
- [x] Phase 2: the shell and the visual system. Fonts self hosted, the prototype stylesheet ported, the shell and intake rebuilt, 097 for the patient number. Both repos build clean.
- [x] Phase 3: the ward. Morning Dose with the archive drawer, the prescription player on a real waveform, the CLASSIFIED paper card with the breach hold, the stat strip, the archive, and the cinematics.
- [x] Phase 4: the waiting room. Repainted to the prototype, server rules untouched.
- [x] Phase 5: my file. The paper folder, every cell the spec names, the polaroid, and the three rows under it.
- [x] Phase 6: the money. Three pack refill in one tap, PRESCRIPTION EMPTY, the rules card, real receipts, and the rail proved idempotent on Postgres.
- [x] Phase 7: the admin. The launch model on the desk, publish by hand, per-prescription target, courtesy setting, and the economy on Financials.
- [ ] Phase 8: the sweep and the proof
- [ ] Final zips cut and pushed
