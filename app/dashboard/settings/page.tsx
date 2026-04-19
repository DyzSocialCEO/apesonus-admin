"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Database, Key, Shield, Crown, Loader2, AlertTriangle, CheckCircle2, Save, Sliders,
} from "lucide-react"

// ──────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────
interface GenesisStatus {
  state: "not_started" | "active" | "expired"
  startedAt: string | null
  endsAt: string | null
  daysRemaining: number | null
  closed: boolean
  windowDays: number
  genesisBadgeCount: number
  threshold: number
  maxHolders: number
  slotsLeft: number
}

interface GenesisConfig {
  threshold: number
  maxHolders: number
  holdersIssued: number
  slotsLeft: number
  windowStartedAt: string | null
  windowClosed: boolean
  bounds: {
    minThreshold: number
    maxThreshold: number
    minMaxHolders: number
    maxMaxHolders: number
  }
}

export default function SettingsPage() {
  // ── Genesis window state ──
  const [status, setStatus] = useState<GenesisStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  // ── Genesis config state (threshold + maxHolders) ──
  const [config, setConfig] = useState<GenesisConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [thresholdInput, setThresholdInput] = useState<string>("")
  const [maxHoldersInput, setMaxHoldersInput] = useState<string>("")
  const [configBusy, setConfigBusy] = useState(false)
  const [configMsg, setConfigMsg] = useState("")

  // ──────────────────────────────────────────────
  // FETCHERS
  // ──────────────────────────────────────────────
  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/genesis-window")
      const data = await res.json()
      if (res.ok) setStatus(data)
      else setStatus(null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchConfig = async () => {
    setConfigLoading(true)
    try {
      const res = await fetch("/api/admin/genesis-config")
      const data = await res.json()
      if (res.ok) {
        setConfig(data)
        setThresholdInput(String(data.threshold))
        setMaxHoldersInput(String(data.maxHolders))
      }
    } catch {} finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => { fetchStatus(); fetchConfig() }, [])

  // ──────────────────────────────────────────────
  // WINDOW START / CLOSE
  // ──────────────────────────────────────────────
  const handleStart = async () => {
    if (!confirm(
      "Start the Genesis Window NOW?\n\n" +
      "This begins the official 45-day countdown. From this moment, every user who earns 10,000 $ONUS during the window is granted the PERMANENT Genesis Badge, up to the max holders cap.\n\n" +
      "Only the first N users (current max: " + (config?.maxHolders ?? 100) + ") to hit the threshold will mint. After 45 days or once the cap fills, no new badges are issued."
    )) return

    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/genesis-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg("Genesis Window started. Countdown is live.")
        await fetchStatus()
        await fetchConfig()
      } else {
        setMsg(data.error || "Failed to start window")
      }
    } catch {
      setMsg("Failed to start window")
    } finally { setBusy(false) }
  }

  const handleClose = async () => {
    if (!confirm(
      "Force-close the Genesis Window early?\n\n" +
      "After this, no new users will receive the Genesis Badge — only those who minted during the window keep theirs (permanently)."
    )) return

    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/genesis-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg("Genesis Window closed.")
        await fetchStatus()
        await fetchConfig()
      } else {
        setMsg(data.error || "Failed to close window")
      }
    } catch {
      setMsg("Failed to close window")
    } finally { setBusy(false) }
  }

  // ──────────────────────────────────────────────
  // CONFIG SAVE (threshold + maxHolders)
  // ──────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (!config) return
    const t = parseInt(thresholdInput, 10)
    const m = parseInt(maxHoldersInput, 10)

    if (!Number.isFinite(t) || !Number.isFinite(m)) {
      setConfigMsg("Both values must be whole numbers")
      return
    }
    if (t === config.threshold && m === config.maxHolders) {
      setConfigMsg("No changes")
      return
    }
    if (t < config.bounds.minThreshold || t > config.bounds.maxThreshold) {
      setConfigMsg(`Threshold must be between ${config.bounds.minThreshold} and ${config.bounds.maxThreshold}`)
      return
    }
    if (m < config.bounds.minMaxHolders || m > config.bounds.maxMaxHolders) {
      setConfigMsg(`Max holders must be between ${config.bounds.minMaxHolders} and ${config.bounds.maxMaxHolders}`)
      return
    }
    if (m < config.holdersIssued) {
      setConfigMsg(`Cannot set max holders below current (${config.holdersIssued} already minted)`)
      return
    }

    const windowActive = config.windowStartedAt !== null && !config.windowClosed
    const warnText = windowActive
      ? "⚠️ The window is currently OPEN. Changing these values now may feel unfair to users who have already started earning. Continue?\n\n"
      : ""

    if (!confirm(
      warnText +
      `Threshold: ${config.threshold.toLocaleString()} $ONUS → ${t.toLocaleString()} $ONUS\n` +
      `Max holders: ${config.maxHolders} → ${m}\n\n` +
      "Live changes apply immediately."
    )) return

    setConfigBusy(true)
    setConfigMsg("")
    try {
      const res = await fetch("/api/admin/genesis-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: t, maxHolders: m }),
      })
      const data = await res.json()
      if (data.success) {
        setConfigMsg(`Updated. Threshold ${data.threshold.toLocaleString()} · Max ${data.maxHolders}`)
        await fetchStatus()
        await fetchConfig()
      } else {
        setConfigMsg(data.error || "Failed to update config")
      }
    } catch {
      setConfigMsg("Failed to update config")
    } finally { setConfigBusy(false) }
  }

  // ──────────────────────────────────────────────
  // RENDER HELPERS
  // ──────────────────────────────────────────────
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—"
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    } catch { return "—" }
  }

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400">Configure your admin panel</p>
      </div>

      {/* ── GENESIS WINDOW ─────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10">
              <Crown className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-white">Genesis Window</CardTitle>
              <CardDescription>45-day launch window that mints the permanent Genesis Badge for the first N users to collect {config?.threshold?.toLocaleString() ?? "10,000"} $ONUS</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading status...
            </div>
          ) : !status ? (
            <p className="text-sm text-red-400">Failed to load Genesis Window status.</p>
          ) : (
            <div className="space-y-4">
              {/* State banner */}
              {status.state === "not_started" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-400/10 border border-yellow-400/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-yellow-200/80">
                    <p className="font-semibold mb-1">Window not started</p>
                    <p>The Genesis race has not officially started. No user can mint the badge yet. Click <strong>Start</strong> to begin the 45-day countdown.</p>
                  </div>
                </div>
              )}

              {status.state === "active" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-green-400/10 border border-green-400/20">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-green-200/80">
                    <p className="font-semibold mb-1">Window is live</p>
                    <p>Countdown is running. The first {status.maxHolders} users to earn {status.threshold.toLocaleString()} $ONUS are minting the permanent Genesis Badge.</p>
                  </div>
                </div>
              )}

              {status.state === "expired" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800 border border-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-gray-400">
                    <p className="font-semibold mb-1">Window closed</p>
                    <p>The Genesis Window has ended. Existing badge holders keep their badge permanently. No new mints possible.</p>
                  </div>
                </div>
              )}

              {/* Stats grid: 6 values */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">State</p>
                  <p className="text-sm font-bold text-white">
                    {status.state === "not_started" ? "Not Started" : status.state === "active" ? "Active" : "Closed"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Started</p>
                  <p className="text-xs font-medium text-white">{fmtDate(status.startedAt)}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Ends</p>
                  <p className="text-xs font-medium text-white">{fmtDate(status.endsAt)}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Days Left</p>
                  <p className="text-sm font-bold text-yellow-400">{status.daysRemaining ?? "—"}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Slots Left</p>
                  <p className="text-sm font-bold text-yellow-400">{status.slotsLeft} / {status.maxHolders}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Holders</p>
                  <p className="text-sm font-bold text-white">{status.genesisBadgeCount}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {status.state === "not_started" && (
                  <Button onClick={handleStart} disabled={busy} className="bg-yellow-400 text-black hover:bg-yellow-300">
                    {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Crown className="w-4 h-4 mr-1" />}
                    Start Genesis Window
                  </Button>
                )}
                {status.state === "active" && (
                  <Button onClick={handleClose} disabled={busy} variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                    {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Force-close window
                  </Button>
                )}
              </div>

              {msg && <p className="text-xs text-gray-300">{msg}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── GENESIS CONFIG (threshold + max holders) ────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10">
              <Sliders className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-white">Genesis Badge Config</CardTitle>
              <CardDescription>Tune the race threshold and max holder cap. Live changes apply immediately.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading config...
            </div>
          ) : !config ? (
            <p className="text-sm text-red-400">Failed to load Genesis config.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    $ONUS Threshold to Mint
                  </label>
                  <Input
                    type="number"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    placeholder="10000"
                    min={config.bounds.minThreshold}
                    max={config.bounds.maxThreshold}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Range: {config.bounds.minThreshold.toLocaleString()} – {config.bounds.maxThreshold.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Max Genesis Holders
                  </label>
                  <Input
                    type="number"
                    value={maxHoldersInput}
                    onChange={(e) => setMaxHoldersInput(e.target.value)}
                    placeholder="100"
                    min={config.bounds.minMaxHolders}
                    max={config.bounds.maxMaxHolders}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Range: {config.bounds.minMaxHolders} – {config.bounds.maxMaxHolders} · Currently issued: {config.holdersIssued}
                  </p>
                </div>
              </div>

              {config.windowStartedAt && !config.windowClosed && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-400/10 border border-red-400/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-200/80">
                    <strong>Window is open.</strong> Changing these values now may feel unfair to users who have already started earning. Proceed with caution.
                  </p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap items-center">
                <Button
                  onClick={handleSaveConfig}
                  disabled={configBusy}
                  className="bg-yellow-400 text-black hover:bg-yellow-300"
                >
                  {configBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Save Config
                </Button>
                {configMsg && <p className="text-xs text-gray-300">{configMsg}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DATABASE ─────────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Database</CardTitle>
              <CardDescription>Connected to Supabase</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm">
            Your admin panel is connected to the same Supabase database as your APESONUS app.
          </p>
        </CardContent>
      </Card>

      {/* ── ENVIRONMENT VARIABLES ──────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-400/10">
              <Key className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Environment Variables</CardTitle>
              <CardDescription>Required configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">NEXT_PUBLIC_SUPABASE_URL</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">SUPABASE_SERVICE_ROLE_KEY</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">ADMIN_USERNAME</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">ADMIN_PASSWORD</code>
              <Badge>Required</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SECURITY ──────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-400/10">
              <Shield className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Security</CardTitle>
              <CardDescription>Best practices</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>✓ Session-based authentication</li>
            <li>✓ HTTP-only cookies</li>
            <li>✓ Service role key server-side only</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-4 text-center">
          <p className="text-gray-500 text-sm">APESONUS Admin v1.0.0</p>
        </CardContent>
      </Card>
    </div>
  )
}
