"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Database, Shield, CheckCircle2, AlertTriangle, Loader2,
  Save, Sparkles, Clock, Activity, RefreshCw, AlertCircle, Wallet, Check, Gem, Swords,
} from "lucide-react"

// Base58 (no 0 O I l), 32-44 chars, the same check the API enforces.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/**
 * /dashboard/settings. The admin settings page.
 *
 * Stage 1 extension: subscription pricing, treasury wallet, Genesis
 * window close, SOL/USD price source, manual pin fallback, yearly
 * bonus CP amount, and the admin test-mode toggle. Plus a "Run
 * expiry sweep now" button that hits /api/cron/expire-subscriptions
 * with the CRON_SECRET stored server-side (the endpoint is on the
 * main app; admin calls it via a proxy route, see below).
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
        <p className="text-gray-400">System info and payment controls.</p>
      </div>

      {/* Banner */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${msgErr ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          <AlertCircle className="w-4 h-4" />
          {msg}
          <button onClick={() => setMsg(null)} className="ml-auto text-xs underline">dismiss</button>
        </div>
      )}

      {/* Receiving wallet, the one live working control */}
      <ReceivingWalletCard />
      <PayRailCard />
      <PaymentsToggleCard />



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

    </div>
  )
}

function PaymentsToggleCard() {
  const [on, setOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/settings")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setOn(String(data.settings?.payments_enabled ?? "").toLowerCase() === "true")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async () => {
    const next = !on
    setSaving(true); setErr(null)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { payments_enabled: next ? "true" : "false" } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setOn(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Wallet className="w-4 h-4" /> Pass purchases
        </CardTitle>
        <CardDescription>
          Master switch for taking money. When off, the app runs fully (music, games, Embers)
          but no one can buy Admission. Used for a soft launch before payments go live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              disabled={saving}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-gray-700"}`}
              aria-pressed={on}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div className="text-sm">
              <span className={on ? "text-emerald-400 font-semibold" : "text-gray-400 font-semibold"}>
                {saving ? "Saving…" : on ? "Payments ON, Admission is for sale" : "Payments OFF, purchases blocked"}
              </span>
              {!on && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Also requires a receiving wallet set above before turning on.
                </p>
              )}
            </div>
            {err && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 ml-auto">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {err}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



function ReceivingWalletCard() {
  const [current, setCurrent] = useState("")   // last saved value
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/settings")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const w = String(data.settings?.helius_treasury_wallet ?? "")
      setCurrent(w); setValue(w)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const trimmed = value.trim()
  const valid = SOLANA_ADDRESS_RE.test(trimmed)
  const dirty = trimmed !== current
  const showInvalid = trimmed.length > 0 && !valid

  const save = async () => {
    if (!valid) {
      setErr("That doesn't look like a Solana address (32-44 base58 characters).")
      return
    }
    setSaving(true); setErr(null); setSaved(false)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { helius_treasury_wallet: trimmed } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setCurrent(trimmed); setValue(trimmed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Wallet className="w-4 h-4" /> Receiving wallet
        </CardTitle>
        <CardDescription>
          Solana address that receives payments when deposit mode is off. Changes take effect immediately on save.
          With deposit mode ON, every buyer pays a one-time address instead and this wallet is never shown to
          anyone; funds arrive by sweep to the destination set on Railway (SWEEP_DESTINATION_WALLET), not here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Current address</label>
              {current ? (
                <code className="block text-sm text-gray-200 font-mono break-all bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  {current}
                </code>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Not set. Payments have nowhere to land.
                </span>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">New address</label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Paste a Solana wallet address"
                spellCheck={false}
                className={`bg-gray-800 font-mono text-sm ${showInvalid ? "border-red-600/60" : "border-gray-700"}`}
              />
              {showInvalid && (
                <p className="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Not a valid Solana address (32-44 base58 characters).
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving || !dirty || !valid}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 ${saved ? "bg-emerald-500 text-black" : "bg-yellow-500 hover:bg-yellow-400 text-black"}`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? "Saved" : "Save wallet"}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Receiving wallet updated.
                </span>
              )}
              {err && (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {err}
                </span>
              )}
              {dirty && !saved && !err && <span className="text-xs text-amber-400">Unsaved change</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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

/**
 * Which token passes are paid in.
 *
 * "usdc" is the stable rail and needs nothing set. "onus" is the floating
 * rail: the app quotes each order in tokens at the live price and freezes
 * that amount, so the mint and its decimals have to be right before the
 * rail is flipped. The app refuses to switch on a malformed mint, so a
 * half-filled form here cannot take money in a token nothing can verify.
 */
function PayRailCard() {
  const [usdcOn, setUsdcOn] = useState(true)
  const [tokenOn, setTokenOn] = useState(false)
  const [bonus, setBonus] = useState("0")
  const [mint, setMint] = useState("")
  const [decimals, setDecimals] = useState("6")
  const [symbol, setSymbol] = useState("ONUS")
  const [ttl, setTtl] = useState("5")
  const [manualPrice, setManualPrice] = useState("")
  const [loaded, setLoaded] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/settings")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const s = data.settings || {}
      // The pair is authoritative when it has ever been saved; the legacy
      // single pay_rail only decides for a database from before the pair.
      let rails: string[] = []
      try {
        const parsed = JSON.parse(String(s.pay_rails ?? "null"))
        if (Array.isArray(parsed)) rails = parsed.map((x: unknown) => String(x))
      } catch {}
      if (rails.length === 0) rails = [String(s.pay_rail ?? "usdc") === "onus" ? "onus" : "usdc"]
      const next = {
        pay_rails: JSON.stringify(rails),
        token_bonus_pct: String(s.token_bonus_pct ?? "0"),
        onus_mint: String(s.onus_mint ?? ""),
        onus_decimals: String(s.onus_decimals ?? "6"),
        onus_symbol: String(s.onus_symbol ?? "ONUS"),
        onus_ttl_min: String(s.onus_ttl_min ?? "5"),
        onus_manual_price_usd: String(s.onus_manual_price_usd ?? ""),
      }
      setUsdcOn(rails.includes("usdc"))
      setTokenOn(rails.includes("onus"))
      setBonus(next.token_bonus_pct)
      setMint(next.onus_mint)
      setDecimals(next.onus_decimals)
      setSymbol(next.onus_symbol)
      setTtl(next.onus_ttl_min)
      setManualPrice(next.onus_manual_price_usd)
      setLoaded(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const trimmedMint = mint.trim()
  const mintValid = SOLANA_ADDRESS_RE.test(trimmedMint)
  const decNum = Number(decimals)
  const decValid = Number.isFinite(decNum) && decNum >= 0 && decNum <= 12
  const ttlNum = Number(ttl)
  const ttlValid = Number.isFinite(ttlNum) && ttlNum >= 1 && ttlNum <= 60
  const canGoOnus = mintValid && decValid && ttlValid
  const bonusNum = Number(bonus)
  const bonusValid = bonus.trim() === "" || (Number.isFinite(bonusNum) && bonusNum >= 0 && bonusNum <= 100)
  const railsNow = JSON.stringify([...(tokenOn ? ["onus"] : []), ...(usdcOn ? ["usdc"] : [])])
  const dirty =
    railsNow !== (loaded.pay_rails ?? "") ||
    bonus.trim() !== (loaded.token_bonus_pct ?? "0") ||
    trimmedMint !== (loaded.onus_mint ?? "") ||
    decimals !== (loaded.onus_decimals ?? "") ||
    symbol.trim() !== (loaded.onus_symbol ?? "") ||
    ttl !== (loaded.onus_ttl_min ?? "") ||
    manualPrice.trim() !== (loaded.onus_manual_price_usd ?? "")

  const save = async () => {
    if (!usdcOn && !tokenOn) {
      setErr("At least one rail has to stay open, or nobody can pay at all.")
      return
    }
    if (tokenOn && !canGoOnus) {
      setErr("Fill in a valid mint, decimals and window before opening the token rail.")
      return
    }
    if (!bonusValid) {
      setErr("The token bonus is a whole percent from 0 to 100.")
      return
    }
    setSaving(true); setErr(null); setSaved(false)
    try {
      const updates: Record<string, string> = {
        pay_rails: railsNow,
        // Kept in step for anything still reading the old single key: the
        // token leads when it is open, which is how the app has behaved.
        pay_rail: tokenOn ? "onus" : "usdc",
        token_bonus_pct: String(Math.max(0, Math.min(90, Math.floor(bonusNum || 0)))),
        clinic_rate_pct: String(Math.max(0, Math.min(90, Math.floor(bonusNum || 0)))),
        onus_mint: trimmedMint,
        onus_decimals: String(decimals),
        onus_symbol: symbol.trim().toUpperCase(),
        onus_ttl_min: String(ttl),
        onus_manual_price_usd: manualPrice.trim(),
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setLoaded(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Gem className="w-4 h-4" /> Payment token
        </CardTitle>
        <CardDescription>
          The tokens buyers can pay in. Both rails can be open at once, into one receiving
          wallet. On the token rail each order is quoted at the live price and frozen, so the
          mint and decimals must be correct before it opens. Pending orders keep the token
          they were opened on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setUsdcOn((v) => !v)}
                className={`px-3 py-2 rounded-lg text-sm border ${usdcOn ? "bg-green-950/40 border-green-700 text-green-400" : "border-gray-700 text-gray-500"}`}
              >
                USDC (stable) {usdcOn ? "· ON" : "· OFF"}
              </button>
              <button
                onClick={() => setTokenOn((v) => !v)}
                className={`px-3 py-2 rounded-lg text-sm border ${tokenOn ? "bg-green-950/40 border-green-700 text-green-400" : "border-gray-700 text-gray-500"}`}
              >
                Token (floating) {tokenOn ? "· ON" : "· OFF"}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Both can be on at once. The checkout then asks the buyer which one, and every
              payment lands at the same receiving wallet. Switch one off and it disappears from
              the checkout; at least one has to stay on.
            </p>

            <Field label="Token mint address (the CA)">
              <Input
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                placeholder="Paste the mint address at launch"
                className="bg-gray-950 border-gray-800 text-white font-mono text-xs"
              />
            </Field>
            {trimmedMint.length > 0 && !mintValid && (
              <p className="text-xs text-red-400">That doesn't look like a Solana address (32-44 base58 characters).</p>
            )}

            <Field label="Clinic rate discount for paying in the token (%)">
              <Input
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                inputMode="numeric"
                className="bg-gray-950 border-gray-800 text-white"
              />
            </Field>
            <p className="text-xs text-gray-500">
              The same Admission costs this much less on the token rail. The price is still decided in
              dollars and only then converted, so the token moving changes how many tokens somebody
              sends, never what they owe. USDC pays the standard rate. Zero turns the discount off.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Decimals">
                <Input value={decimals} onChange={(e) => setDecimals(e.target.value)} inputMode="numeric"
                  className="bg-gray-950 border-gray-800 text-white" />
              </Field>
              <Field label="Symbol">
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value)}
                  className="bg-gray-950 border-gray-800 text-white" />
              </Field>
              <Field label="Order window (min)">
                <Input value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric"
                  className="bg-gray-950 border-gray-800 text-white" />
              </Field>
            </div>

            <Field label="Fallback price in USD per token (leave blank unless the feeds are down)">
              <Input
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="e.g. 0.0000021"
                inputMode="decimal"
                className="bg-gray-950 border-gray-800 text-white font-mono text-xs"
              />
            </Field>
            <p className="text-xs text-gray-500">
              Live feeds are tried first and this is only used when they all go silent. A stale
              number here sells passes at the wrong price, so clear it once the feeds are back.
            </p>

            {tokenOn && !canGoOnus && (
              <p className="text-xs text-amber-400">
                The app will stay on USDC until the mint, decimals and window are all valid.
              </p>
            )}

            {err && <p className="text-xs text-red-400">{err}</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-300 border border-amber-500/40 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save rail
              </button>
              {saved && <span className="text-xs text-green-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
              {dirty && !saved && <span className="text-xs text-amber-400">Unsaved change</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

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
