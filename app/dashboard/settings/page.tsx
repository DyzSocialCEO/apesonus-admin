"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Shield, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"

/**
 * /dashboard/settings — Admin system info (post-Phase-4.5 cleanup).
 *
 * The old Settings page managed the Genesis Badge window + config.
 * Those features are gone as of main-app Phase 1. This page now
 * shows what's still worth knowing at a glance:
 *
 *   - Supabase connection status (via a cheap query to app_settings)
 *   - Admin session identity + audit trail link
 *   - Environment overview (public Supabase URL — safe to display)
 *
 * No controls on this page. Configuration surface has moved inline
 * to the feature pages that need it.
 */

interface HealthStatus {
  supabaseOk: boolean
  userCount: number | null
  latencyMs: number | null
  error: string | null
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const t0 = performance.now()
      try {
        // Reuse the existing /api/admin/analytics route as a cheap
        // authenticated ping — if it returns 200 with a userCount,
        // Supabase is reachable and admin auth is working.
        const res = await fetch("/api/admin/analytics")
        const t1 = performance.now()

        if (!cancelled) {
          if (res.ok) {
            const data = await res.json()
            setHealth({
              supabaseOk: true,
              userCount: data?.totalUsers ?? null,
              latencyMs: Math.round(t1 - t0),
              error: null,
            })
          } else {
            setHealth({
              supabaseOk: false,
              userCount: null,
              latencyMs: Math.round(t1 - t0),
              error: `HTTP ${res.status}`,
            })
          }
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({
            supabaseOk: false,
            userCount: null,
            latencyMs: null,
            error: err instanceof Error ? err.message : "Unknown error",
          })
          setLoading(false)
        }
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const supabaseHost = supabaseUrl
    ? (() => { try { return new URL(supabaseUrl).host } catch { return supabaseUrl } })()
    : "not configured"

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">System</h1>
        <p className="text-gray-400 mt-1">
          Connection health + admin session info.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Supabase health ─────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Database className="w-5 h-5" />
              Supabase
            </CardTitle>
            <CardDescription>Database connection + admin client auth</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Checking…</span>
              </div>
            )}
            {!loading && health && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {health.supabaseOk ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Connected
                      </Badge>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                        {health.error || "Unreachable"}
                      </Badge>
                    </>
                  )}
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Host</dt>
                    <dd className="text-white font-mono text-xs">{supabaseHost}</dd>
                  </div>
                  {health.latencyMs !== null && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Round-trip</dt>
                      <dd className="text-white font-mono">{health.latencyMs}ms</dd>
                    </div>
                  )}
                  {health.userCount !== null && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Users on record</dt>
                      <dd className="text-white font-mono">
                        {health.userCount.toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Admin session ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5" />
              Admin session
            </CardTitle>
            <CardDescription>Who you are + what gets logged</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  Authenticated
                </Badge>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Destructive actions (track edits, $ONUS adjustments, banner
                changes, audio signing) are recorded in the admin audit log.
                Check the Logs page to review recent activity.
              </p>
              <a
                href="/dashboard/logs"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                View audit log →
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── What used to be here ───────────────────────── */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-white">What changed</CardTitle>
          <CardDescription>History of features removed from this page</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 leading-relaxed">
            The Genesis Badge window controls and Founders Pass pricing
            used to live here. Both were removed when APESONUS moved to
            a fully free model without premium tiers. The app no longer
            sells passes or runs mint windows, so there is nothing to
            configure at this level anymore. Feature-specific settings
            (tracks, banners, $ONUS adjustments) live on their own pages.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
