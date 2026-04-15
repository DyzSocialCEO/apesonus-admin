-- ══════════════════════════════════════════════════════════════════
-- APESONUS — Migration 028: Admin Audit Log
--
-- Records every admin-initiated mutation that affects payment-critical
-- or user-experience-critical state. Append-only — admins cannot
-- silently change history.
--
-- Use cases:
--   * "Who changed Founders Pass price from 500 to 1 last Tuesday?"
--   * "When was Genesis Window started/closed?"
--   * "Did anyone mint themselves ONUS while I was on holiday?"
--
-- This table is intentionally simple (no FK to admins because admins
-- aren't users in the users table). Indexed by created_at for time
-- range queries from the admin UI.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,                 -- session.username
  action      TEXT NOT NULL,                 -- e.g. "founders_pass_price.change"
  details     JSONB NOT NULL DEFAULT '{}',   -- before/after, metadata
  ip          TEXT,                          -- requester IP (best effort)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON admin_audit_log (actor, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON admin_audit_log (action, created_at DESC);

-- RLS: locked down. Only the service role (admin panel) can read or write.
-- Regular users have zero visibility into this table.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON admin_audit_log;
CREATE POLICY "service role only" ON admin_audit_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE admin_audit_log IS
  'Append-only audit trail for admin mutations. Never UPDATE or DELETE rows here.';
