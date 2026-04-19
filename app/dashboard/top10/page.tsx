"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Crown, Trophy, Loader2, AlertTriangle, CheckCircle2, Save, Eye, EyeOff } from "lucide-react"

interface HallConfig {
  is_active: boolean
  coming_soon_message: string
}

interface WeeklyConfig {
  is_active: boolean
  coming_soon_message: string
  current_pot_stars: number
  pot_distribution: number[]
  current_week_start: string | null
}

interface HallRow {
  rank: number
  telegramId: string
  username: string | null
  firstName: string | null
  totalOnus: number
  genesisBadge: boolean
  genesisHolderNumber: number | null
}

interface WeeklyRow {
  rank: number
  telegramId: string
  username: string | null
  firstName: string | null
  weeklyOnus: number
  genesisBadge: boolean
}

type Tab = "weekly" | "hall"

export default function Top10Page() {
  const [tab, setTab] = useState<Tab>("weekly")

  // Config state
  const [hallCfg, setHallCfg] = useState<HallConfig | null>(null)
  const [weeklyCfg, setWeeklyCfg] = useState<WeeklyConfig | null>(null)

  // Input state for editable fields
  const [hallMsg, setHallMsg] = useState("")
  const [weeklyMsg, setWeeklyMsg] = useState("")

  // Leaderboard data
  const [hallRows, setHallRows] = useState<HallRow[]>([])
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  // ────────────────────────────────────────────
  // FETCHERS
  // ────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true)
    try {
      const [cfgRes, dataRes] = await Promise.all([
        fetch("/api/admin/leaderboards-config"),
        fetch("/api/admin/leaderboard-data"),
      ])
      if (cfgRes.ok) {
        const cfg = await cfgRes.json()
        setHallCfg(cfg.hallOfFame)
        setHallMsg(cfg.hallOfFame.coming_soon_message || "")
        setWeeklyCfg(cfg.weeklyTop10)
        setWeeklyMsg(cfg.weeklyTop10.coming_soon_message || "")
      }
      if (dataRes.ok) {
        const data = await dataRes.json()
        setHallRows(data.hallOfFame || [])
        setWeeklyRows(data.weeklyTop10 || [])
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [])

  // ────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────
  const patchConfig = async (body: any) => {
    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/leaderboards-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setMsg("Saved.")
        await fetchAll()
      } else {
        setMsg(data.error || "Failed to save")
      }
    } catch {
      setMsg("Failed to save")
    } finally { setBusy(false) }
  }

  const toggleHall = () => {
    if (!hallCfg) return
    const nextState = !hallCfg.is_active
    if (!confirm(
      nextState
        ? "Activate the Hall of Fame? Users will see the live leaderboard starting now."
        : "Deactivate the Hall of Fame? Users will see the 'Coming soon' message instead."
    )) return
    patchConfig({ hallOfFame: { is_active: nextState } })
  }

  const toggleWeekly = () => {
    if (!weeklyCfg) return
    const nextState = !weeklyCfg.is_active
    if (!confirm(
      nextState
        ? "Activate Weekly Top 10? Users will see the live leaderboard AND the weekly Stars pool."
        : "Deactivate Weekly Top 10? Users will see the 'Coming soon' message instead."
    )) return
    patchConfig({ weeklyTop10: { is_active: nextState } })
  }

  const saveHallMsg = () => {
    if (!hallCfg || hallMsg.trim() === hallCfg.coming_soon_message) return
    patchConfig({ hallOfFame: { coming_soon_message: hallMsg.trim() } })
  }

  const saveWeeklyMsg = () => {
    if (!weeklyCfg || weeklyMsg.trim() === weeklyCfg.coming_soon_message) return
    patchConfig({ weeklyTop10: { coming_soon_message: weeklyMsg.trim() } })
  }

  // ────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboards</h1>
        <p className="text-gray-400">Weekly Top 10 and Hall of Fame — activation, messaging, live data</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-800">
        <button
          onClick={() => setTab("weekly")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "weekly"
              ? "text-yellow-400 border-b-2 border-yellow-400 -mb-px"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Trophy className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Weekly Top 10
        </button>
        <button
          onClick={() => setTab("hall")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "hall"
              ? "text-yellow-400 border-b-2 border-yellow-400 -mb-px"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Crown className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Hall of Fame
        </button>
      </div>

      {msg && <p className="text-xs text-gray-300">{msg}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : tab === "weekly" ? (
        <WeeklySection
          cfg={weeklyCfg}
          rows={weeklyRows}
          msgInput={weeklyMsg}
          onMsgChange={setWeeklyMsg}
          onToggle={toggleWeekly}
          onSaveMsg={saveWeeklyMsg}
          busy={busy}
        />
      ) : (
        <HallSection
          cfg={hallCfg}
          rows={hallRows}
          msgInput={hallMsg}
          onMsgChange={setHallMsg}
          onToggle={toggleHall}
          onSaveMsg={saveHallMsg}
          busy={busy}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────
// WEEKLY TOP 10 SECTION
// ────────────────────────────────────────────
function WeeklySection(props: {
  cfg: WeeklyConfig | null
  rows: WeeklyRow[]
  msgInput: string
  onMsgChange: (s: string) => void
  onToggle: () => void
  onSaveMsg: () => void
  busy: boolean
}) {
  const { cfg, rows, msgInput, onMsgChange, onToggle, onSaveMsg, busy } = props
  if (!cfg) return <p className="text-sm text-red-400">Failed to load Weekly config.</p>

  return (
    <div className="space-y-6">
      <StatusBanner active={cfg.is_active} label="Weekly Top 10" />
      <ActivationCard
        title="Activation"
        description="Flip this on when you're ready for users to see the live Weekly Top 10 and receive Stars payouts."
        isActive={cfg.is_active}
        busy={busy}
        onToggle={onToggle}
      />
      <ComingSoonCard
        label="Weekly Top 10"
        value={msgInput}
        saved={cfg.coming_soon_message}
        onChange={onMsgChange}
        onSave={onSaveMsg}
        busy={busy}
      />

      {/* Pot & Distribution placeholder (Commit 7b) */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-sm text-white">Stars Pot & Distribution</CardTitle>
          <CardDescription>Configure weekly pot size and per-rank payout amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-gray-800/60">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Current Pot</p>
              <p className="text-sm font-bold text-yellow-400">{cfg.current_pot_stars.toLocaleString()} ★</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-800/60 col-span-2 sm:col-span-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Distribution (#1 → #10)</p>
              <p className="text-xs font-mono text-white break-all">{cfg.pot_distribution.join(" · ")}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600">
            Pot and distribution editor coming in the next update. Values shown are live.
          </p>
        </CardContent>
      </Card>

      <LeaderboardTable
        title="Live Weekly Rankings"
        description={`${rows.length} users currently in the running. Rankings reset each Monday.`}
        emptyMessage="No users have earned ONUS this week yet. Rankings appear here as activity accumulates."
        rows={rows.map((r) => ({
          rank: r.rank,
          name: r.firstName || r.username || "—",
          username: r.username,
          telegramId: r.telegramId,
          amount: r.weeklyOnus,
          amountLabel: "weekly $ONUS",
          isGenesis: r.genesisBadge,
          holderNumber: null,
        }))}
      />
    </div>
  )
}

// ────────────────────────────────────────────
// HALL OF FAME SECTION
// ────────────────────────────────────────────
function HallSection(props: {
  cfg: HallConfig | null
  rows: HallRow[]
  msgInput: string
  onMsgChange: (s: string) => void
  onToggle: () => void
  onSaveMsg: () => void
  busy: boolean
}) {
  const { cfg, rows, msgInput, onMsgChange, onToggle, onSaveMsg, busy } = props
  if (!cfg) return <p className="text-sm text-red-400">Failed to load Hall of Fame config.</p>

  return (
    <div className="space-y-6">
      <StatusBanner active={cfg.is_active} label="Hall of Fame" />
      <ActivationCard
        title="Activation"
        description="Flip this on whenever you want users to see the all-time earners list. No payouts involved — purely prestige."
        isActive={cfg.is_active}
        busy={busy}
        onToggle={onToggle}
      />
      <ComingSoonCard
        label="Hall of Fame"
        value={msgInput}
        saved={cfg.coming_soon_message}
        onChange={onMsgChange}
        onSave={onSaveMsg}
        busy={busy}
      />
      <LeaderboardTable
        title="Live Hall of Fame"
        description={`${rows.length} users in the top 100 by all-time $ONUS collected.`}
        emptyMessage="No users with total $ONUS > 0 yet. The Hall of Fame populates as users earn."
        rows={rows.map((r) => ({
          rank: r.rank,
          name: r.firstName || r.username || "—",
          username: r.username,
          telegramId: r.telegramId,
          amount: r.totalOnus,
          amountLabel: "total $ONUS",
          isGenesis: r.genesisBadge,
          holderNumber: r.genesisHolderNumber,
        }))}
      />
    </div>
  )
}

// ────────────────────────────────────────────
// SHARED UI COMPONENTS
// ────────────────────────────────────────────
function StatusBanner({ active, label }: { active: boolean; label: string }) {
  return active ? (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-400/10 border border-green-400/20">
      <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
      <div className="text-xs text-green-200/80">
        <p className="font-semibold mb-1">{label} is LIVE</p>
        <p>Users are seeing the real leaderboard right now.</p>
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-400/10 border border-yellow-400/20">
      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
      <div className="text-xs text-yellow-200/80">
        <p className="font-semibold mb-1">{label} is HIDDEN</p>
        <p>Users see the &quot;Coming soon&quot; message. You see real data here.</p>
      </div>
    </div>
  )
}

function ActivationCard(props: {
  title: string
  description: string
  isActive: boolean
  busy: boolean
  onToggle: () => void
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-sm text-white">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={props.onToggle}
          disabled={props.busy}
          className={
            props.isActive
              ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
              : "bg-yellow-400 text-black hover:bg-yellow-300"
          }
        >
          {props.busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : props.isActive ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
          {props.isActive ? "Deactivate (hide from users)" : "Activate (show to users)"}
        </Button>
      </CardContent>
    </Card>
  )
}

function ComingSoonCard(props: {
  label: string
  value: string
  saved: string
  onChange: (s: string) => void
  onSave: () => void
  busy: boolean
}) {
  const dirty = props.value.trim() !== props.saved
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-sm text-white">Coming Soon Message</CardTitle>
        <CardDescription>
          Shown to users while {props.label} is hidden. Max 500 chars.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="w-full min-h-[80px] p-3 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400/40"
          placeholder="Inscribe the teaser copy here..."
          maxLength={500}
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">{props.value.length} / 500</p>
          <Button
            onClick={props.onSave}
            disabled={props.busy || !dirty}
            size="sm"
            className="bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40"
          >
            {props.busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Save Message
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LeaderboardTable(props: {
  title: string
  description: string
  emptyMessage: string
  rows: {
    rank: number
    name: string
    username: string | null
    telegramId: string
    amount: number
    amountLabel: string
    isGenesis: boolean
    holderNumber: number | null
  }[]
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-sm text-white">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {props.rows.length === 0 ? (
          <div className="py-8 text-center">
            <Trophy className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{props.emptyMessage}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">#</th>
                  <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Holder</th>
                  <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Telegram ID</th>
                  <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold text-right">{props.rows[0].amountLabel}</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((r) => (
                  <tr key={r.telegramId + "-" + r.rank} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 px-3">
                      <span className="font-semibold text-white">#{r.rank}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-white flex items-center gap-2">
                        {r.name}
                        {r.isGenesis && (
                          <span className="text-[10px] text-yellow-400/70 font-semibold">
                            ★ Genesis{r.holderNumber ? ` #${r.holderNumber}` : ""}
                          </span>
                        )}
                      </div>
                      {r.username && <div className="text-[11px] text-gray-500">@{r.username}</div>}
                    </td>
                    <td className="py-3 px-3 text-gray-400 font-mono text-xs">{r.telegramId}</td>
                    <td className="py-3 px-3 text-right text-white">{r.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
