"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Database, Key, Shield, Crown, Loader2, AlertTriangle, CheckCircle2, Tag, Save } from "lucide-react"

interface GenesisStatus {
  state: "not_started" | "active" | "expired"
  startedAt: string | null
  endsAt: string | null
  daysRemaining: number | null
  closed: boolean
  windowDays: number
  genesisBadgeCount: number
}

export default function SettingsPage() {
  const [status, setStatus] = useState<GenesisStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  // Founders Pass price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceInput, setPriceInput] = useState<string>("")
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceMsg, setPriceMsg] = useState("")
  const [priceLoading, setPriceLoading] = useState(true)

  const fetchPrice = async () => {
    setPriceLoading(true)
    try {
      const res = await fetch("/api/admin/founders-pass-price")
      const data = await res.json()
      if (typeof data.amount === "number") {
        setCurrentPrice(data.amount)
        setPriceInput(String(data.amount))
      }
    } catch {} finally { setPriceLoading(false) }
  }

  const handleUpdatePrice = async () => {
    const amount = parseInt(priceInput, 10)
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      setPriceMsg("Price must be a whole number between 1 and 100000 Stars")
      return
    }
    if (amount === currentPrice) {
      setPriceMsg("Price unchanged")
      return
    }
    if (!confirm(
      `Change the Founders Pass price from ${currentPrice} Stars to ${amount} Stars?\n\n` +
      "This change applies immediately. All new purchases use the new price. Existing Founders Pass holders are unaffected.\n\n" +
      "Be careful: lowering the price while the Genesis Window is active may feel unfair to early buyers who paid more."
    )) return

    setPriceBusy(true)
    setPriceMsg("")
    try {
      const res = await fetch("/api/admin/founders-pass-price", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (data.success) {
        setCurrentPrice(data.amount)
        setPriceMsg(`Updated to ${data.amount} Stars. Live now.`)
      } else {
        setPriceMsg(data.error || "Failed to update price")
      }
    } catch { setPriceMsg("Failed to update price") } finally { setPriceBusy(false) }
  }

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/genesis-window")
      const data = await res.json()
      if (!data.error) setStatus(data)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchStatus(); fetchPrice() }, [])

  const handleStart = async () => {
    if (!confirm(
      "Start the Genesis Window NOW?\n\n" +
      "This begins the official 45-day countdown. Every paid subscriber from this moment until the window closes earns the PERMANENT Genesis Badge. After 45 days, new subs no longer earn it.\n\n" +
      "This action cannot be undone."
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
        fetchStatus()
      } else {
        setMsg(data.error || "Failed to start window")
      }
    } catch { setMsg("Failed to start window") } finally { setBusy(false) }
  }

  const handleClose = async () => {
    if (!confirm(
      "Force-close the Genesis Window early?\n\n" +
      "After this, no new subscribers will receive the Genesis Badge — only those who subscribed during the window keep theirs (permanently)."
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
        fetchStatus()
      } else {
        setMsg(data.error || "Failed to close window")
      }
    } catch { setMsg("Failed to close window") } finally { setBusy(false) }
  }

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  }) : "—"

  return (
    <div className="space-y-6 p-6">
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
              <CardDescription>45-day launch window that mints the permanent Genesis Badge for paid subscribers</CardDescription>
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
              {/* Soft launch warning */}
              {status.state === "not_started" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-400/10 border border-yellow-400/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-yellow-200/80">
                    <p className="font-semibold mb-1">Soft launch mode</p>
                    <p>The window has not officially started. All paid subscribers currently auto-receive the Genesis Badge (safe for testing). Click <strong>Start</strong> to begin the official 45-day countdown.</p>
                  </div>
                </div>
              )}

              {status.state === "active" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-green-400/10 border border-green-400/20">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-green-200/80">
                    <p className="font-semibold mb-1">Window is live</p>
                    <p>Countdown is running. Every paid subscription right now earns the permanent Genesis Badge.</p>
                  </div>
                </div>
              )}

              {status.state === "expired" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800 border border-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-gray-400">
                    <p className="font-semibold mb-1">Window closed</p>
                    <p>The Genesis Window has ended. Existing badge holders keep their badge permanently. New subs do not earn it.</p>
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              </div>

              <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-800">
                <p className="text-xs text-gray-400">
                  <span className="text-yellow-400 font-bold">{status.genesisBadgeCount}</span> users currently hold the Genesis Badge
                </p>
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

      {/* ── FOUNDERS PASS PRICE ─────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10">
              <Tag className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-white">Founders Pass Price</CardTitle>
              <CardDescription>One-time unlock price in Telegram Stars. Changes apply immediately to all new purchases.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {priceLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading current price...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-gray-800/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Current Price</p>
                <p className="text-2xl font-bold text-yellow-400">{currentPrice} <span className="text-sm font-normal text-gray-400">Stars</span></p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                  New Price (Stars)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    step={1}
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    disabled={priceBusy}
                    className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-yellow-400/50 disabled:opacity-50"
                    placeholder="e.g., 300"
                  />
                  <Button
                    onClick={handleUpdatePrice}
                    disabled={priceBusy || priceInput === String(currentPrice) || !priceInput}
                    className="bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {priceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <><Save className="w-4 h-4 mr-1.5" /> Update</>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Range: 1 – 100,000 Stars. Whole numbers only. Change takes effect on the next purchase attempt.
                </p>
              </div>

              {priceMsg && (
                <div className={`p-2 rounded-lg text-xs ${
                  priceMsg.toLowerCase().includes("fail") || priceMsg.toLowerCase().includes("must")
                    ? "bg-red-400/10 text-red-300"
                    : "bg-green-400/10 text-green-300"
                }`}>
                  {priceMsg}
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-400/5 border border-amber-400/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-200/80">
                  <p className="font-semibold mb-1">Price change guidelines</p>
                  <p>Raising the price is safe. Lowering it during the active Genesis Window may feel unfair to early buyers who paid more. Consider keeping the price stable through the full 45-day window for trust.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DATABASE ───────────────────────────────────────── */}
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
