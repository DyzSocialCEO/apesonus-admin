"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Sparkles, Loader2, AlertTriangle, CheckCircle2, Wallet, Coins, RotateCcw } from "lucide-react"

interface Settings {
  genesis_window_starts_at: string
  genesis_window_duration_days: string
  genesis_window_duration_hours: string
  helius_treasury_wallet: string
  helius_webhook_secret: string
  cp_pack_topup_cents: string
  cp_pack_bundle_cents: string
  cp_pack_whale_cents: string
  cp_pack_topup_amount: string
  cp_pack_bundle_amount: string
  cp_pack_whale_amount: string
  daily_free_cp_grant: string
  ledger_day_threshold: string
}

const EMPTY: Settings = {
  genesis_window_starts_at: "",
  genesis_window_duration_days: "45",
  genesis_window_duration_hours: "",
  helius_treasury_wallet: "",
  helius_webhook_secret: "",
  cp_pack_topup_cents: "100",
  cp_pack_bundle_cents: "500",
  cp_pack_whale_cents: "2000",
  cp_pack_topup_amount: "100",
  cp_pack_bundle_amount: "600",
  cp_pack_whale_amount: "3000",
  daily_free_cp_grant: "20",
  ledger_day_threshold: "5",
}

export default function CpEconomyPage() {
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [saved, setSaved] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgError, setMsgError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/settings", { credentials: "include" })
      const data = await r.json()
      const merged: Settings = { ...EMPTY, ...(data.settings || {}) }
      setSettings(merged); setSaved(merged)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)
  const windowStarted = !!settings.genesis_window_starts_at

  const hoursVal = Number(settings.genesis_window_duration_hours || 0)
  const daysVal = Number(settings.genesis_window_duration_days || 0)
  const windowMs = hoursVal > 0
    ? hoursVal * 3600000
    : (daysVal > 0 ? daysVal * 86400000 : 45 * 86400000)
  const windowLabel = hoursVal > 0
    ? `${hoursVal} hour${hoursVal === 1 ? "" : "s"}`
    : `${daysVal || 45} day${(daysVal || 45) === 1 ? "" : "s"}`

  let countdownText = ""
  let windowClosed = false
  if (windowStarted) {
    const startMs = new Date(settings.genesis_window_starts_at).getTime()
    const remaining = startMs + windowMs - Date.now()
    if (remaining > 0) {
      const d = Math.floor(remaining / 86400000)
      const h = Math.floor((remaining % 86400000) / 3600000)
      const m = Math.floor((remaining % 3600000) / 60000)
      countdownText = d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`
    } else { countdownText = "Window closed"; windowClosed = true }
  }

  const set = (k: keyof Settings, v: string) => setSettings((s) => ({ ...s, [k]: v }))

  const patch = async (updates: Record<string, string>, okMsg: string) => {
    setSaving(true); setMsg(null); setMsgError(false)
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ updates }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Save failed")
      const next = { ...settings, ...updates }
      setSettings(next); setSaved(next); setMsg(okMsg)
    } catch (e) {
      setMsgError(true); setMsg(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  const startGenesisWindow = async () => {
    setConfirmStart(false)
    await patch(
      {
        genesis_window_starts_at: new Date().toISOString(),
        genesis_window_duration_days: settings.genesis_window_duration_days || "45",
        genesis_window_duration_hours: settings.genesis_window_duration_hours || "",
      },
      `Genesis window started (${windowLabel}).`
    )
  }

  const resetGenesisWindow = async () => {
    setConfirmReset(false)
    await patch({ genesis_window_starts_at: "" }, "Genesis window reset. You can start it again.")
  }

  const saveAll = async () => {
    const delta: Record<string, string> = {}
    for (const k of Object.keys(settings) as (keyof Settings)[]) {
      if (settings[k] !== saved[k]) delta[k] = settings[k]
    }
    if (Object.keys(delta).length === 0) return
    await patch(delta, "Saved.")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-white">
        <Coins className="h-5 w-5 text-yellow-500" />
        <h1 className="text-2xl font-bold">CP Economy</h1>
      </div>

      {/* Genesis (First Press) window — flexible + resettable */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Genesis / First Press window
          </CardTitle>
          <CardDescription>
            While this window is open, a $5+ purchase mints the holder a
            First Press (gold) card. Set the length in hours for quick
            testing, or days for production. You can start AND reset it
            as many times as you need — it is not one-shot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                    Duration — hours (testing)
                  </label>
                  <Input
                    value={settings.genesis_window_duration_hours}
                    onChange={(e) => set("genesis_window_duration_hours", e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="e.g. 1 or 2 (blank = use days)"
                    className="bg-gray-950 border-gray-800 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                    Duration — days (production)
                  </label>
                  <Input
                    value={settings.genesis_window_duration_days}
                    onChange={(e) => set("genesis_window_duration_days", e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="45"
                    className="bg-gray-950 border-gray-800 text-white text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                Effective window: <span className="text-yellow-400 font-medium">{windowLabel}</span>
                {" "}(hours overrides days when set). Save changes below, then Start.
              </p>

              {windowStarted ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={windowClosed
                      ? "bg-gray-500/15 text-gray-400 border-gray-500/40"
                      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/40"}>
                      {windowClosed ? "Closed" : "Active"}
                    </Badge>
                    <span className="text-sm text-gray-300">{countdownText}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Started {new Date(settings.genesis_window_starts_at).toLocaleString()}.
                    Length: {windowLabel}.
                  </p>
                  {confirmReset ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">Reset closes the window now. Re-startable. Continue?</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={resetGenesisWindow} disabled={saving}
                          className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-semibold disabled:opacity-50">
                          Yes, reset window
                        </button>
                        <button onClick={() => setConfirmReset(false)}
                          className="px-4 py-2 bg-gray-800 text-gray-300 rounded text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmReset(true)} disabled={saving}
                      className="px-4 py-2 bg-gray-800 text-gray-200 rounded text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" /> Reset window
                    </button>
                  )}
                </div>
              ) : confirmStart ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Start the {windowLabel} window now? ($5+ buys mint First Press while open.)
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={startGenesisWindow} disabled={saving}
                      className="px-4 py-2 bg-yellow-500 text-black rounded text-sm font-semibold disabled:opacity-50">
                      Yes, start the {windowLabel} window
                    </button>
                    <button onClick={() => setConfirmStart(false)}
                      className="px-4 py-2 bg-gray-800 text-gray-300 rounded text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmStart(true)}
                  disabled={!settings.helius_treasury_wallet || dirty}
                  className="px-4 py-2 bg-yellow-500 text-black rounded text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!settings.helius_treasury_wallet
                    ? "Set the treasury wallet first"
                    : dirty ? "Save changes first" : ""}>
                  Start the {windowLabel} window
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Helius payment rail */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5 text-yellow-500" />
            Helius payment rail
          </CardTitle>
          <CardDescription>
            Treasury wallet receives USDC. Webhook secret is legacy
            (payments now confirm by direct chain read, no webhook).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              Treasury wallet (Solana mainnet address)
            </label>
            <Input value={settings.helius_treasury_wallet}
              onChange={(e) => set("helius_treasury_wallet", e.target.value)}
              placeholder="32-44 base58 chars"
              className="bg-gray-950 border-gray-800 text-white font-mono text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              Helius webhook secret (legacy — optional)
            </label>
            <Input type="password" value={settings.helius_webhook_secret}
              onChange={(e) => set("helius_webhook_secret", e.target.value)}
              placeholder="Not required for payments"
              className="bg-gray-950 border-gray-800 text-white font-mono text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Pack pricing */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Coins className="h-5 w-5 text-yellow-500" />
            Pack pricing &amp; grants
          </CardTitle>
          <CardDescription>
            USDC prices in cents (100 = $1). CP credited on payment.
            $5+ packs qualify for the First Press card while the window is open.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <NumField label="Top-up price ($)" value={settings.cp_pack_topup_cents}  onChange={(v) => set("cp_pack_topup_cents",  v)} centsToDollars />
          <NumField label="Top-up CP"        value={settings.cp_pack_topup_amount} onChange={(v) => set("cp_pack_topup_amount", v)} />
          <NumField label="Bundle price ($)" value={settings.cp_pack_bundle_cents}  onChange={(v) => set("cp_pack_bundle_cents",  v)} centsToDollars />
          <NumField label="Bundle CP"        value={settings.cp_pack_bundle_amount} onChange={(v) => set("cp_pack_bundle_amount", v)} />
          <NumField label="Whale price ($)"  value={settings.cp_pack_whale_cents}   onChange={(v) => set("cp_pack_whale_cents",   v)} centsToDollars />
          <NumField label="Whale CP"         value={settings.cp_pack_whale_amount}  onChange={(v) => set("cp_pack_whale_amount",  v)} />
          <NumField label="Daily free CP"    value={settings.daily_free_cp_grant}   onChange={(v) => set("daily_free_cp_grant",   v)} />
          <NumField label="Ledger threshold" value={settings.ledger_day_threshold}  onChange={(v) => set("ledger_day_threshold",  v)} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-4">
        <button onClick={saveAll} disabled={!dirty || saving}
          className="px-4 py-2 bg-yellow-500 text-black rounded font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </button>
        {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
        {msg && (
          <span className={`text-xs flex items-center gap-1 ${msgError ? "text-red-400" : "text-green-400"}`}>
            {!msgError && <CheckCircle2 className="h-3 w-3" />}{msg}
          </span>
        )}
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, centsToDollars }: {
  label: string; value: string; onChange: (v: string) => void; centsToDollars?: boolean
}) {
  const display = centsToDollars && value ? (Number(value) / 100).toString() : value
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">{label}</label>
      <Input
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "")
          onChange(centsToDollars ? String(Math.round(Number(raw || 0) * 100)) : raw.replace(/[^0-9]/g, ""))
        }}
        className="bg-gray-950 border-gray-800 text-white text-sm"
      />
    </div>
  )
}
