/**
 * APESONUS Admin — Audit Log Helper
 *
 * Wraps the admin_audit_log table. Always best-effort — audit logging
 * MUST NEVER break the underlying admin action. If the log fails (DB down,
 * permissions, etc.) we swallow the error rather than 500-ing on the user.
 *
 * Pattern:
 *   await logAdminAction(supabase, request, session.username, "founders_pass_price.change", {
 *     before: 500,
 *     after: 1000,
 *   })
 */

import type { createAdminClient } from "@/lib/supabase"

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>

/**
 * Best-effort write to admin_audit_log. Never throws.
 */
export async function logAdminAction(
  supabase: AdminClient,
  request: Request | null,
  actor: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    let ip: string | null = null
    if (request) {
      ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null
    }

    await supabase.from("admin_audit_log").insert({
      actor: actor || "unknown",
      action,
      details,
      ip,
    })
  } catch {
    // Audit failures must never break the admin action that triggered them.
    // The underlying operation has already succeeded by the time we log.
  }
}
