"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Database, Shield, CheckCircle2, AlertTriangle, Loader2,
  Save, Sparkles, Clock, Activity, RefreshCw, AlertCircle,
} from "lucide-react"

/**
 * /dashboard/settings — Admin settings page.
 *
 * Stage 1 extension: subscription pricing, treasury wallet, Genesis
 * window close, SOL/USD price source, manual pin fallback, yearly
 * bonus CP amount, and the admin test-mode toggle. Plus a "Run
 * expiry sweep now" button that hits /api/cron/expire-subscriptions
 * with the CRON_SECRET stored server-side (the endpoint is on the
 * main app; admin calls it via a proxy route — see below).
 *
 * Existing health snapshot is preserved at the top.
 */

interface HealthStatus {
  supabaseOk: boolean
  userCount: number | null
  latencyMs: number | null
  error: string | null
}

interface Settings {
  subscription_price_monthly_usd: string
  subscription_price_yearly_usd: string
  genesis_window_closes_at: string
  sol_usd_price_source: string
  sol_usd_manual_pin: string
  yearly_subscriber_cp_bonus: string
  admin_test_mode: string
  [key: string]: string
}

const EMPTY_SETTINGS: Settings = {
  subscription_price_monthly_usd: "",
  subscription_price_yearly_usd: "",
  genesis_window_closes_at: "",
  sol_usd_price_source: "pyth",
  sol_usd_manual_pin: "",
  yearly_subscriber_cp_bonus: "",
  admin_test_mode: "false",
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [savedSettings, setSavedSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgErr, setMsgErr] = useState(false)

  // ── Health snapshot (kept from old settings page) ───────────────
  useEffect(() => {
    let cancelled = false
    async function check() {
      const t0 = performance.now()
      try {
        const res = await fetch("/api/admin/analytics")
        const t1 = performance.now()
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json()
            setHealth({
              supabaseOk: true,
              userCount: data.totalUsers ?? null,
              latencyMs: Math.round(t1 - t0),
              error: null,
            })
          } else {
            setHealth({ supabaseOk: false, userCount: null, latencyMs: null, error: `HTTP ${res.status}` })
          }
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({
            supabaseOk: false, userCount: null, latencyMs: null,
            error: err instanceof Error ? err.message : "unknown",
          })
        }
      } finally {
        if (!cancelled) setHealthLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // ── Settings load ────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch("/api/admin/settings")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const merged = { ...EMPTY_SETTINGS, ...(data.settings || {}) } as Settings
      setSettings(merged)
      setSavedSettings(merged)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Load failed")
      setMsgErr(true)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  const onSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      // Send only changed keys
      const updates: Record<string, string> = {}
      for (const k of Object.keys(settings) as (keyof Settings)[]) {
        if (settings[k] !== savedSettings[k]) updates[k as string] = settings[k]
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setMsg("Saved."); setMsgErr(false)
      setSavedSettings(settings)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed"); setMsgErr(true)
    } finally {
      setSaving(false)
    }
  }

  // ── Genesis window helpers (relative date pickers) ───────────────
  const setGenesisRelative = (ms: number) => {
    const t = new Date(Date.now() + ms)
    setSettings((s) => ({ ...s, genesis_window_closes_at: t.toISOString() }))
  }

  const setGenesisClosedNow = () => {
    setSettings((s) => ({ ...s, genesis_window_closes_at: new Date().toISOString() }))
  }

  // ── Local date input value formatting ────────────────────────────
  const genesisInputValue = (() => {
    if (!settings.genesis_window_closes_at) return ""
    const d = new Date(settings.genesis_window_closes_at)
    if (Number.isNaN(d.getTime())) return ""
    // datetime-local needs YYYY-MM-DDTHH:mm (no seconds, no Z)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400">System info and subscription controls.</p>
      </div>

      {/* Banner */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${msgErr ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          <AlertCircle className="w-4 h-4" />
          {msg}
          <button onClick={() => setMsg(null)} className="ml-auto text-xs underline">dismiss</button>
        </div>
      )}

      {/* Health snapshot */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Activity className="w-4 h-4" /> System health
          </CardTitle>
          <CardDescription>Read-only snapshot.</CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Pinging…
            </div>
          ) : health ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {health.supabaseOk ? (
                <Badge className="bg-green-500/20 text-green-400 border-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Supabase OK
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-0">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Supabase: {health.error}
                </Badge>
              )}
              {health.userCount != null && <span className="text-gray-400">{health.userCount.toLocaleString()} users</span>}
              {health.latencyMs != null && <span className="text-gray-500 text-xs">{health.latencyMs}ms</span>}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Subscription controls */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Database className="w-4 h-4" /> Subscription configuration
            </CardTitle>
            <CardDescription>Live config. Changes take effect immediately on save.</CardDescription>
          </div>
          <button onClick={fetchSettings} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </button>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-5">
              {/* Pricing */}
              <Section title="Pricing">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monthly USD">
                    <Input
                      type="number"
                      step="0.01"
                      value={settings.subscription_price_monthly_usd}
                      onChange={(e) => setSettings((s) => ({ ...s, subscription_price_monthly_usd: e.target.value }))}
                      className="bg-gray-800 border-gray-700"
                    />
                  </Field>
                  <Field label="Yearly USD">
                    <Input
                      type="number"
                      step="0.01"
                      value={settings.subscription_price_yearly_usd}
                      onChange={(e) => setSettings((s) => ({ ...s, subscription_price_yearly_usd: e.target.value }))}
                      className="bg-gray-800 border-gray-700"
                    />
                  </Field>
                </div>
              </Section>

              {/* Genesis window */}
              <Section title="Genesis window">
                <Field label="Window closes at">
                  <Input
                    type="datetime-local"
                    value={genesisInputValue}
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      const d = new Date(v)
                      setSettings((s) => ({ ...s, genesis_window_closes_at: d.toISOString() }))
                    }}
                    className="bg-gray-800 border-gray-700"
                  />
                </Field>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Pill onClick={() => setGenesisRelative(5 * 60_000)}>+5 min</Pill>
                  <Pill onClick={() => setGenesisRelative(60 * 60_000)}>+1 hour</Pill>
                  <Pill onClick={() => setGenesisRelative(24 * 60 * 60_000)}>+1 day</Pill>
                  <Pill onClick={() => setGenesisRelative(45 * 24 * 60 * 60_000)}>+45 days</Pill>
                  <Pill onClick={setGenesisClosedNow} danger>Close immediately</Pill>
                </div>
              </Section>

              {/* Price source */}
              <Section title="SOL/USD price source">
                <div className="grid grid-cols-3 gap-2">
                  {(["pyth", "coingecko", "manual_pin"] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => setSettings((s) => ({ ...s, sol_usd_price_source: src }))}
                      className={`text-xs px-3 py-2 rounded-lg ${
                        settings.sol_usd_price_source === src
                          ? "bg-yellow-500 text-black font-semibold"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {src === "manual_pin" ? "Manual pin" : src}
                    </button>
                  ))}
                </div>
                <Field label="Manual pin (used when source=manual_pin or live feed fails)">
                  <Input
                    type="number"
                    step="0.01"
                    value={settings.sol_usd_manual_pin}
                    onChange={(e) => setSettings((s) => ({ ...s, sol_usd_manual_pin: e.target.value }))}
                    className="bg-gray-800 border-gray-700"
                  />
                </Field>
              </Section>

              {/* Bonuses */}
              <Section title="Bonuses">
                <Field label="Yearly subscriber bonus CP (one-time, credited on annual purchase)">
                  <Input
                    type="number"
                    value={settings.yearly_subscriber_cp_bonus}
                    onChange={(e) => setSettings((s) => ({ ...s, yearly_subscriber_cp_bonus: e.target.value }))}
                    className="bg-gray-800 border-gray-700"
                  />
                </Field>
              </Section>

              {/* Test mode */}
              <Section title="Admin test mode">
                <div className="flex items-center gap-2">
                  <Pill
                    active={settings.admin_test_mode === "true"}
                    onClick={() => setSettings((s) => ({ ...s, admin_test_mode: "true" }))}
                  >
                    Enabled
                  </Pill>
                  <Pill
                    active={settings.admin_test_mode === "false"}
                    onClick={() => setSettings((s) => ({ ...s, admin_test_mode: "false" }))}
                  >
                    Disabled
                  </Pill>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Cosmetic flag for the dashboard. Real test grants go through "Manual grant" with source=Admin Test.
                  The user-facing /subscribe/verify endpoint never honours this — payments always hit Solana RPC.
                </p>
              </Section>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={onSave}
                  disabled={!isDirty || saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save changes
                </button>
                {isDirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sweep button */}
      <ExpirySweepCard />
    </div>
  )
}

function ExpirySweepCard() {
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgErr, setMsgErr] = useState(false)

  const run = async () => {
    if (!confirm("Run expiry sweep now? Lapsed subscribers drop back to free.")) return
    setRunning(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/run-expiry-sweep", { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setMsg(`Swept. Expired: ${body.expiredCount ?? 0}`); setMsgErr(false)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed"); setMsgErr(true)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Clock className="w-4 h-4" /> Expiry sweep
        </CardTitle>
        <CardDescription>Force the hourly cron sweep to run now.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={running}
            className="text-sm px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40"
          >
            {running ? "Running…" : "Run expiry sweep now"}
          </button>
          {msg && (
            <span className={`text-xs ${msgErr ? "text-red-400" : "text-green-400"}`}>{msg}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Small inline components
// ─────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  )
}

function Pill({
  onClick,
  children,
  active,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  danger?: boolean
}) {
  let cls = "text-xs px-3 py-1.5 rounded-lg "
  if (active) cls += "bg-yellow-500 text-black font-semibold"
  else if (danger) cls += "bg-red-500/15 text-red-400 hover:bg-red-500/25"
  else cls += "bg-gray-800 text-gray-400 hover:bg-gray-700"
  return (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  )
}
