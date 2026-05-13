# APESONUS Admin — Stage 1

Layers Stage 1 onto your `apesonus-admin-main`. Extract over the project root.

## Apply

```bash
cd ~/path/to/apesonus-admin-main
git checkout -b stage1-subscriptions
unzip -o /path/to/apesonus-admin-stage1.zip
git status
git diff
git add -A
git commit -m "stage 1: subscriptions dashboard + settings + manual grants"
git push -u origin stage1-subscriptions
```

## What's in the zip

### New files
- `app/dashboard/subscriptions/page.tsx` — list, stats, filters, search, manual-grant modal
- `app/dashboard/subscriptions/[userId]/page.tsx` — per-user deep view: current sub, history, extend/expire/revoke
- `app/api/admin/subscriptions/route.ts` — GET (list+stats) / POST (grant)
- `app/api/admin/subscriptions/[id]/route.ts` — PATCH (extend/expire/revoke)
- `app/api/admin/settings/route.ts` — GET/PATCH (allowlisted subscription keys)
- `app/api/admin/run-expiry-sweep/route.ts` — proxy to main app's cron sweep with CRON_SECRET

### Modified files
- `components/sidebar.tsx` — adds Subscriptions nav entry between Streaks and Users
- `app/dashboard/settings/page.tsx` — extends the old health-only Settings page with
  pricing / treasury / Genesis window / price source / yearly bonus / test mode / sweep button

## Required environment variables

Already on Railway:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

New for Stage 1 (both optional but recommended):
- `MAIN_APP_URL` — URL of the main PWA (e.g. `https://apesonus-pwa-preview.up.railway.app`).
  Used by `/api/admin/run-expiry-sweep` to proxy the sweep through the main app.
  If unset, the sweep call still works — it calls the DB function directly, which is
  functionally equivalent.
- `CRON_SECRET` — same value as on the main app. Only needed if `MAIN_APP_URL` is set.

## Notes

- Every admin mutation writes to `admin_audit_log` via `logAdminAction` (existing pattern).
- The `assign_subscription` RPC respects the same Genesis-window logic whether
  the grant comes from `/api/subscribe/verify` (real payment) or this admin path.
- `admin_test_mode` setting is cosmetic. The real test path is "Manual grant"
  with source = "Admin Test" — those grants never award yearly bonus CP.
- The user-facing `/api/subscribe/verify` route NEVER honours test mode. Real
  payments only on that path, regardless of env vars or settings.
