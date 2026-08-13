"use client"

/**
 * /dashboard/finance
 *
 * What came in, in the token it came in as, and what it is worth now.
 * One page: the tokens received, the dollars they were sold for, the live
 * price, and the daily line. Nothing derived, nothing from the old economy.
 */

import { useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

type Fin = {
  rail: string
  symbol: string
  mint: string
  wallet: string
  price: number | null
  payments: number
  daysSold: number
  tokenReceived: number
  tokenUsdAtSale: number
  tokenValueNow: number | null
  stableUsd: number
  usd24h: number
  usd7d: number
  usd30d: number
  series: { date: string; token: number; usd: number; payments: number }[]
  economy: {
    accounts: number
    spinsSold: number
    spinsHeld: number
    givenStarter: number
    givenRefills: number
    dosesTaken: number
    refilledAccounts: number
    courtesyTreatments: number
    spinsPerDollar: number
    givenPct: number
  } | null
}

const usd = (n: number | null) =>
  n == null
    ? "—"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const num = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })

export default function FinancePage() {
  const [d, setD] = useState<Fin | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch("/api/admin/finance", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.error ? setErr(String(j.error)) : setD(j)))
      .catch(() => setErr("Could not load."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Housekeeping for orders nobody paid. Only ones already past their pay
  // window are touched, and the numbers above are re-read afterwards so the
  // desk never shows a count the database no longer agrees with.
  const clearPending = async () => {
    if (clearing) return
    if (
      !confirm(
        "Clear every pending order past its pay window? Orders still inside their window are left alone, and a late payment of an exact amount still credits.",
      )
    ) {
      return
    }
    setClearing(true)
    setCleared(null)
    try {
      const res = await fetch("/api/admin/finance/clear-pending", { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`)
      const n = Number(body?.cleared ?? 0)
      setCleared(`Cleared ${n} stale pending order${n === 1 ? "" : "s"}.`)
      load()
    } catch (e) {
      setCleared(e instanceof Error ? e.message : "Could not clear pending orders.")
    } finally {
      setClearing(false)
    }
  }

  if (loading && !d) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
      </div>
    )
  }
  if (err || !d) return <div className="p-10 text-gray-500">{err || "Could not load."}</div>

  const Tile = ({
    label,
    value,
    hint,
    accent,
  }: {
    label: string
    value: string
    hint?: string
    accent?: string
  }) => (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: accent || "#fff" }}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-gray-600">{hint}</div> : null}
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Finance</h1>
          <p className="mt-1 text-gray-400">
            Every confirmed payment is counted in the dollars it was quoted at and the token it
            arrived as.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label="USDC received"
          value={usd(d.stableUsd)}
          hint="All confirmed payments on the stable rail"
          accent="#c6ff2e"
        />
        <Tile
          label="Sold for"
          value={usd(d.stableUsd + d.tokenUsdAtSale)}
          hint="Every rail, at the quoted dollar prices"
        />
        <Tile label="Days sold" value={d.daysSold.toLocaleString("en-US")} hint={`${d.payments} payments`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Last 24 hours" value={usd(d.usd24h)} />
        <Tile label="Last 7 days" value={usd(d.usd7d)} />
        <Tile label="Last 30 days" value={usd(d.usd30d)} />
      </div>

      {d.tokenReceived > 0 ? (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
          The retired token rail took {num(d.tokenReceived, 2)} {d.symbol}, sold for{" "}
          {usd(d.tokenUsdAtSale)} at the door
          {d.tokenValueNow != null ? <> and worth {usd(d.tokenValueNow)} at today&apos;s price</> : null}. Kept
          apart on purpose: those were {d.symbol}, not dollars.
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-sm font-semibold text-white">Thirty days</div>
        <div className="mt-1 text-[11px] text-gray-600">
          Dollars sold per day. Hover for the payment count.
        </div>
        <div className="mt-4 h-56">
          {d.series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-600">
              Nothing yet. The first payment shows up here.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.series}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8 }}
                  labelStyle={{ color: "#9ca3af" }}
                  formatter={(v: number, name: string) =>
                    name === "usd" ? [usd(v), "Sold for"] : [v, "Payments"]
                  }
                />
                <Area type="monotone" dataKey="usd" stroke="#c6ff2e" fill="rgba(198,255,46,.15)" strokeWidth={2} />
                <Area type="monotone" dataKey="payments" stroke="transparent" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
        <div className="text-xs uppercase tracking-wider text-gray-500">Where it lands</div>
        <div className="mt-2 break-all font-mono text-[12px] text-gray-300">{d.wallet || "No wallet set"}</div>
        {d.tokenReceived > 0 ? (
          <>
            <div className="mt-3 text-xs uppercase tracking-wider text-gray-500">Retired token rail mint</div>
            <div className="mt-1 break-all font-mono text-[12px] text-gray-300">{d.mint || "Not set"}</div>
          </>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-xs uppercase tracking-wider text-gray-500">Housekeeping</div>
        <p className="mt-2 text-sm text-gray-400">
          Orders that were opened and never paid sit as pending until their window runs out.
          This marks the ones already past their window as expired. Anything still inside its
          window is left alone, and a late payment of the exact amount still credits.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={clearPending}
            disabled={clearing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Clear stale pending orders
          </button>
          {cleared ? <span className="text-xs text-gray-400">{cleared}</span> : null}
        </div>
      </div>

      {/* ── THE ECONOMY ──
          What was sold against what was handed over. These are counted in the
          database, not by pulling rows into this page: a response is capped at
          a thousand rows, which is how a number on a desk quietly stops moving
          while the app stays correct. */}
      {d.economy ? (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-white">The economy</h2>
          <p className="mt-1 text-sm text-gray-500">
            Spins sold against Spins given away, and what patients are still holding.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Spins sold"
              value={d.economy.spinsSold.toLocaleString("en-US")}
              hint={
                d.economy.spinsPerDollar > 0
                  ? `${Math.round(d.economy.spinsPerDollar).toLocaleString("en-US")} Spins per dollar taken`
                  : "nothing sold yet"
              }
            />
            <Tile
              label="Spins held"
              value={d.economy.spinsHeld.toLocaleString("en-US")}
              hint="paid for and not yet taken. This is the liability."
              accent="#facc15"
            />
            <Tile
              label="Given away"
              value={(d.economy.givenStarter + d.economy.givenRefills).toLocaleString("en-US")}
              hint={`${d.economy.givenStarter.toLocaleString("en-US")} starter, ${d.economy.givenRefills.toLocaleString(
                "en-US",
              )} refills`}
            />
            <Tile
              label="Cost of the economy"
              value={`${d.economy.givenPct.toFixed(1)}%`}
              hint="Spins handed over against Spins sold"
              accent={d.economy.givenPct > 30 ? "#f87171" : "#4ade80"}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Accounts" value={d.economy.accounts.toLocaleString("en-US")} hint="the ward census" />
            <Tile
              label="Doses taken"
              value={d.economy.dosesTaken.toLocaleString("en-US")}
              hint="qualified listens, everybody, all time"
            />
            <Tile
              label="Courtesy treatments"
              value={d.economy.courtesyTreatments.toLocaleString("en-US")}
              hint="free daily treatments started"
            />
            <Tile
              label="Accounts refilled"
              value={d.economy.refilledAccounts.toLocaleString("en-US")}
              hint="patients who have crossed a refill threshold"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
