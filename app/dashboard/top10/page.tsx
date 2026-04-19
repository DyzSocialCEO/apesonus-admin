"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Crown,
  Trophy,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Coins,
  Clock,
} from "lucide-react"

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

interface PayoutRow {
  id: number
  week_start: string
  rank: number
  telegram_id: string
  username: string | null
  first_name: string | null
  onus_earned: number
  stars_paid: number
  paid_at: string | null
  paid_by_admin: string | null
  notes: string | null
}

interface PayoutWeek {
  week_start: string
  rows: PayoutRow[]
  total_pending: number
  total_paid: number
  total_stars_paid: number
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
  const [potInput, setPotInput] = useState("")
  const [distInputs, setDistInputs] = useState<string[]>(Array(10).fill(""))

  // Leaderboard data
  const [hallRows, setHallRows] = useState<HallRow[]>([])
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([])

  // Payout history
  const [payoutWeeks, setPayoutWeeks] = useState<PayoutWeek[]>([])
  const [payoutsLoading, setPayoutsLoading] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])

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
        setPotInput(String(cfg.weeklyTop10.current_pot_stars ?? 0))
        const dist: number[] = Array.isArray(cfg.weeklyTop10.pot_distribution)
          ? cfg.weeklyTop10.pot_distribution
          : []
        const padded: string[] = []
        for (let i = 0; i < 10; i++) padded.push(String(dist[i] ?? 0))
        setDistInputs(padded)
      }
      if (dataRes.ok) {
        const data = await dataRes.json()
        setHallRows(data.hallOfFame || [])
        setWeeklyRows(data.weeklyTop10 || [])
      }
    } catch {} finally { setLoading(false) }
  }

  const fetchPayouts = async () => {
    setPayoutsLoading(true)
    try {
      const res = await fetch("/api/admin/weekly-payouts")
      if (res.ok) {
        const data = await res.json()
        setPayoutWeeks(data.weeks || [])
      }
    } catch {} finally { setPayoutsLoading(false) }
  }

  useEffect(() => {
    fetchAll()
    fetchPayouts()
  }, [])

  // ────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────
  const patchConfig = async (body: any) => {
    setBusy(true)
    setMsg("")
    setWarnings([])
    try {
      const res = await fetch("/api/admin/leaderboards-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setMsg("Saved.")
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          setWarnings(data.warnings)
        }
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

  const savePot = () => {
    if (!weeklyCfg) return
    const pot = Number(potInput)
    if (!Number.isFinite(pot) || !Number.isInteger(pot) || pot < 0) {
      setMsg("Pot must be a non-negative whole number")
      return
    }
    if (distInputs.length !== 10) {
      setMsg("Distribution must have exactly 10 entries")
      return
    }
    const dist: number[] = []
    for (let i = 0; i < 10; i++) {
      const n = Number(distInputs[i])
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        setMsg(`Rank #${i + 1} must be a non-negative whole number`)
        return
      }
      dist.push(n)
    }
    patchConfig({ weeklyTop10: { current_pot_stars: pot, pot_distribution: dist } })
  }

  const markPaid = async (
    weekStart: string,
    rank: number,
    telegramId: string,
    starsPaid: number,
    notes: string
  ) => {
    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/admin/weekly-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: weekStart,
          rank,
          telegram_id: telegramId,
          stars_paid: starsPaid,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg(`Rank #${rank} for week of ${weekStart} marked paid.`)
        await fetchPayouts()
      } else {
        setMsg(data.error || "Failed to mark paid")
      }
    } catch {
      setMsg("Failed to mark paid")
    } finally { setBusy(false) }
  }

  // ────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboards</h1>
        <p className="text-gray-400">Weekly Top 10 and Hall of Fame: activation, messaging, live data</p>
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
      {warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-400/10 border border-yellow-400/20 text-xs text-yellow-200/90 space-y-1">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

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
          potInput={potInput}
          onPotChange={setPotInput}
          distInputs={distInputs}
          onDistChange={(idx, val) => {
            setDistInputs((prev) => {
              const next = [...prev]
              next[idx] = val
              return next
            })
          }}
          onSavePot={savePot}
          payoutWeeks={payoutWeeks}
          payoutsLoading={payoutsLoading}
          onMarkPaid={markPaid}
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
  potInput: string
  onPotChange: (s: string) => void
  distInputs: string[]
  onDistChange: (idx: number, val: string) => void
  onSavePot: () => void
  payoutWeeks: PayoutWeek[]
  payoutsLoading: boolean
  onMarkPaid: (weekStart: string, rank: number, telegramId: string, stars: number, notes: string) => void
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

      <PotEditorCard
        cfg={cfg}
        potInput={props.potInput}
        onPotChange={props.onPotChange}
        distInputs={props.distInputs}
        onDistChange={props.onDistChange}
        onSave={props.onSavePot}
        busy={busy}
      />

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

      <PayoutsHistoryCard
        weeks={props.payoutWeeks}
        loading={props.payoutsLoading}
        potDistribution={cfg.pot_distribution || []}
        onMarkPaid={props.onMarkPaid}
        busy={busy}
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
        description="Flip this on whenever you want users to see the all-time earners list. No payouts involved. Purely prestige."
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
// POT EDITOR CARD
// ────────────────────────────────────────────
function PotEditorCard(props: {
  cfg: WeeklyConfig
  potInput: string
  onPotChange: (s: string) => void
  distInputs: string[]
  onDistChange: (idx: number, val: string) => void
  onSave: () => void
  busy: boolean
}) {
  const { cfg, potInput, onPotChange, distInputs, onDistChange, onSave, busy } = props

  const pot = Number(potInput)
  const distNums = distInputs.map((s) => Number(s))
  const distSum = distNums.reduce((a, b) => (Number.isFinite(b) ? a + b : a), 0)
  const potValid = Number.isFinite(pot) && Number.isInteger(pot) && pot >= 0
  const distValid = distNums.every((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0)
  const sumMatches = potValid && distSum === pot

  const savedPot = cfg.current_pot_stars
  const savedDist = cfg.pot_distribution || []
  const dirty =
    pot !== savedPot ||
    distNums.some((n, i) => n !== (savedDist[i] ?? 0))

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-sm text-white">Stars Pot & Distribution</CardTitle>
        <CardDescription>Total pot and per-rank payout amounts. Sum of ranks should equal total pot.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block mb-1.5">
            Total Pot (★)
          </label>
          <Input
            type="number"
            value={potInput}
            onChange={(e) => onPotChange(e.target.value)}
            min={0}
            max={1000000}
            step={1}
            className="bg-gray-800 border-gray-700 text-white max-w-[200px]"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block mb-1.5">
            Per-Rank Distribution (★)
          </label>
          <div className="grid grid-cols-5 gap-2">
            {distInputs.map((val, i) => (
              <div key={i}>
                <p className="text-[10px] text-gray-500 mb-1">#{i + 1}</p>
                <Input
                  type="number"
                  value={val}
                  onChange={(e) => onDistChange(i, e.target.value)}
                  min={0}
                  step={1}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className={`p-2.5 rounded-lg text-xs font-mono ${
          sumMatches
            ? "bg-green-400/10 border border-green-400/20 text-green-200/90"
            : "bg-yellow-400/10 border border-yellow-400/20 text-yellow-200/90"
        }`}>
          Distribution sum: {distSum.toLocaleString()} ★ &nbsp;/&nbsp; Total pot: {potValid ? pot.toLocaleString() : "—"} ★
          {!sumMatches && (
            <span className="block mt-0.5 text-[10px] opacity-80">
              Sum does not match pot. Save is allowed but double-check before activating.
            </span>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Button
            onClick={onSave}
            disabled={busy || !dirty || !potValid || !distValid}
            size="sm"
            className="bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Save Pot & Distribution
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────
// PAYOUTS HISTORY CARD
// ────────────────────────────────────────────
function PayoutsHistoryCard(props: {
  weeks: PayoutWeek[]
  loading: boolean
  potDistribution: number[]
  onMarkPaid: (weekStart: string, rank: number, telegramId: string, stars: number, notes: string) => void
  busy: boolean
}) {
  const { weeks, loading, potDistribution, onMarkPaid, busy } = props

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-sm text-white flex items-center gap-2">
          <Coins className="w-4 h-4 text-yellow-400" />
          Payouts History
        </CardTitle>
        <CardDescription>
          Weekly Top 10 snapshots. Pay via Telegram Stars, then mark paid here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading payouts...
          </div>
        ) : weeks.length === 0 ? (
          <div className="py-8 text-center">
            <Clock className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              No payout snapshots yet. The first Monday reset will auto-capture the closing week&apos;s top 10.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {weeks.map((wk, idx) => (
              <WeekSection
                key={wk.week_start}
                week={wk}
                potDistribution={potDistribution}
                defaultOpen={idx < 2}
                onMarkPaid={onMarkPaid}
                busy={busy}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WeekSection(props: {
  week: PayoutWeek
  potDistribution: number[]
  defaultOpen: boolean
  onMarkPaid: (weekStart: string, rank: number, telegramId: string, stars: number, notes: string) => void
  busy: boolean
}) {
  const { week, potDistribution, defaultOpen, onMarkPaid, busy } = props
  const [open, setOpen] = useState(defaultOpen)

  const allPaid = week.total_pending === 0 && week.total_paid > 0

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-gray-800/40 hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-sm font-semibold text-white">Week of {week.week_start}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {allPaid ? (
            <span className="px-2 py-0.5 rounded-full bg-green-400/10 text-green-300 border border-green-400/20">
              All Paid
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
              {week.total_pending} pending
            </span>
          )}
          <span className="text-gray-400 font-mono">{week.total_stars_paid.toLocaleString()} ★ paid</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-800">
          {week.rows.map((row) => (
            <PayoutRowLine
              key={row.id}
              row={row}
              defaultStars={potDistribution[row.rank - 1] ?? 0}
              onMarkPaid={onMarkPaid}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PayoutRowLine(props: {
  row: PayoutRow
  defaultStars: number
  onMarkPaid: (weekStart: string, rank: number, telegramId: string, stars: number, notes: string) => void
  busy: boolean
}) {
  const { row, defaultStars, onMarkPaid, busy } = props
  const isPaid = row.paid_at !== null

  const [editing, setEditing] = useState(false)
  const [starsInput, setStarsInput] = useState(String(defaultStars))
  const [notesInput, setNotesInput] = useState("")

  const confirm = () => {
    const stars = Number(starsInput)
    if (!Number.isFinite(stars) || !Number.isInteger(stars) || stars < 0) return
    onMarkPaid(row.week_start, row.rank, row.telegram_id, stars, notesInput)
    setEditing(false)
  }

  return (
    <div className="p-3 hover:bg-gray-800/20">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-white w-8">#{row.rank}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">
            {row.first_name || row.username || "—"}
            {row.username && (
              <span className="text-[11px] text-gray-500 ml-2">@{row.username}</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            ID {row.telegram_id} &nbsp;·&nbsp; {row.onus_earned.toLocaleString()} $ONUS earned
          </div>
        </div>

        {isPaid ? (
          <div className="text-right">
            <div className="text-xs text-green-300 font-semibold flex items-center justify-end gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {row.stars_paid.toLocaleString()} ★
            </div>
            <div className="text-[10px] text-gray-500">
              {new Date(row.paid_at!).toLocaleDateString()} by {row.paid_by_admin || "?"}
            </div>
          </div>
        ) : !editing ? (
          <Button
            onClick={() => {
              setStarsInput(String(defaultStars))
              setNotesInput("")
              setEditing(true)
            }}
            disabled={busy}
            size="sm"
            className="bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40 text-xs h-7"
          >
            Mark Paid
          </Button>
        ) : null}
      </div>

      {editing && (
        <div className="mt-3 pl-11 space-y-2 border-l-2 border-yellow-400/30">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold w-16">Stars</label>
            <Input
              type="number"
              value={starsInput}
              onChange={(e) => setStarsInput(e.target.value)}
              min={0}
              step={1}
              className="bg-gray-800 border-gray-700 text-white text-sm h-8 max-w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold w-16">Notes</label>
            <Input
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              maxLength={500}
              placeholder="Optional"
              className="bg-gray-800 border-gray-700 text-white text-sm h-8 flex-1"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button
              onClick={() => setEditing(false)}
              disabled={busy}
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-white text-xs h-7"
            >
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={busy}
              size="sm"
              className="bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40 text-xs h-7"
            >
              {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Confirm
            </Button>
          </div>
        </div>
      )}
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
