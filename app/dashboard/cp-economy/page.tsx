"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Sparkles, Loader2, AlertTriangle, CheckCircle2, Wallet, Coins } from "lucide-react"

interface Settings {
  genesis_window_starts_at: string
  genesis_window_duration_days: string
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
  helius_treasury_wallet: "",
  helius_webhook_secret: "",
  cp_pack_topup_cents: "100",
  cp_pack_bundle_cents: "500",
  cp_pack_whale_cents: "2000",
  cp_pack_topup_amount: "600",
  cp_pack_bundle_amount: "3500",
  cp_pack_whale_amount: "16000",
  daily_free_cp_grant: "20",
  ledger_day_threshold: "5",
}

export default function CpEconomyPage() {
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [saved, setSaved] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmStart, setConfirmStart] = useState(false)
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
  let countdownText = ""
  if (windowStarted) {
    const startMs = new Date(settings.genesis_window_starts_at).getTime()
    const durDays = Number(settings.genesis_window_duration_days || 45)
    const closesMs = startMs + durDays * 86400000
    const remaining = closesMs - Date.now()
    if (remaining > 0) {
      const days = Math.floor(remaining / 86400000)
      const hours = Math.floor((remaining % 86400000) / 3600000)
      countdownText = `${days}d ${hours}h remaining`
    } else countdownText = "Window closed"
  }

  const set = (k: keyof Settings, v: string) => setSettings((s) => ({ ...s, [k]: v }))

  const startGenesisWindow = async () => {
    setConfirmStart(false)
    const now = new Date().toISOString()
    const next = { ...settings, genesis_window_starts_at: now }
    setSettings(next)
    setSaving(true); setMsg(null); setMsgError(false)
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ settings: { genesis_window_starts_at: now } }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Save failed")
      setSaved(next); setMsg("Genesis window started.")
    } catch (e) {
      setMsgError(true); setMsg(e instanceof Error ? e.message : "Failed to start window")
    } finally { setSaving(false) }
  }

  const saveAll = async () => {
    setSaving(true); setMsg(null); setMsgError(false)
    try {
      const delta: Partial<Settings> = {}
      for (const k of Object.keys(settings) as (keyof Settings)[]) {
        if (settings[k] !== saved[k]) delta[k] = settings[k]
      }
      const r = await fetch("/api/admin/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ settings: delta }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Save failed")
      setSaved(settings); setMsg("Saved.")
    } catch (e) {
      setMsgError(true); setMsg(e instanceof Error ? e.message : "Save failed")
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-white">
        <Coins className="h-5 w-5 text-yellow-500" />
        <h1 className="text-2xl font-bold">CP Economy</h1>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Genesis window
          </CardTitle>
          <CardDescription>
            One-shot toggle. Once started, the 45-day window runs automatically. Cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : windowStarted ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/40">Active</Badge>
                <span className="text-sm text-gray-300">{countdownText}</span>
              </div>
              <p className="text-xs text-gray-500">
                Started at {new Date(settings.genesis_window_starts_at).toLocaleString()}.
                Duration: {settings.genesis_window_duration_days} days.
              </p>
            </div>
          ) : confirmStart ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">This is permanent. Continue?</span>
              </div>
              <div className="flex gap-2">
                <button onClick={startGenesisWindow} disabled={saving} className="px-4 py-2 bg-yellow-500 text-black rounded text-sm font-semibold disabled:opacity-50">Yes, start the 45-day window</button>
                <button onClick={() => setConfirmStart(false)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmStart(true)} disabled={!settings.helius_treasury_wallet}
              className="px-4 py-2 bg-yellow-500 text-black rounded text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title={settings.helius_treasury_wallet ? "" : "Set the treasury wallet first"}>
              Start the 45-day Genesis window
            </button>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5 text-yellow-500" />
            Helius payment rail
          </CardTitle>
          <CardDescription>
            Treasury wallet receives USDC. Webhook secret authenticates Helius. Both must be set before payments work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Treasury wallet (Solana mainnet address)</label>
            <Input value={settings.helius_treasury_wallet} onChange={(e) => set("helius_treasury_wallet", e.target.value)}
              placeholder="32-44 base58 chars" className="bg-gray-950 border-gray-800 text-white font-mono text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Helius webhook secret (Bearer token)</label>
            <Input type="password" value={settings.helius_webhook_secret} onChange={(e) => set("helius_webhook_secret", e.target.value)}
              placeholder="At least 16 chars" className="bg-gray-950 border-gray-800 text-white font-mono text-xs" />
            <p className="text-[10px] text-gray-500 mt-1">In Helius dashboard, set as &quot;Authorization: Bearer ...&quot; header.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Coins className="h-5 w-5 text-yellow-500" />
            Pack pricing &amp; grants
          </CardTitle>
          <CardDescription>USDC prices in cents (100 = $1). CP amounts credited on payment.</CardDescription>
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
  const display = centsToDollars && value ? (Number(value) / 100).toFixed(2) : value
  const handleChange = (raw: string) => {
    if (centsToDollars) {
      const dollars = Number(raw)
      if (!isNaN(dollars)) onChange(String(Math.round(dollars * 100)))
    } else onChange(raw)
  }
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">{label}</label>
      <Input type="number" value={display} onChange={(e) => handleChange(e.target.value)}
        className="bg-gray-950 border-gray-800 text-white font-mono text-sm" />
    </div>
  )
}
