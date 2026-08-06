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

  const load = () => {
    setLoading(true)
    fetch("/api/admin/finance", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.error ? setErr(String(j.error)) : setD(j)))
      .catch(() => setErr("Could not load."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

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
            Patients pay in {d.symbol}. Every confirmed payment is counted in the token that
            arrived and in the dollars it was quoted at.
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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`${d.symbol} received`}
          value={num(d.tokenReceived, 2)}
          hint="All confirmed payments on the token rail"
          accent="#c6ff2e"
        />
        <Tile
          label="Worth now"
          value={usd(d.tokenValueNow)}
          hint={d.price != null ? `At $${d.price.toPrecision(4)} per ${d.symbol}` : "Live price unavailable"}
        />
        <Tile
          label="Sold for"
          value={usd(d.tokenUsdAtSale)}
          hint="The dollar prices those orders were quoted at"
        />
        <Tile label="Days sold" value={d.daysSold.toLocaleString("en-US")} hint={`${d.payments} payments`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Last 24 hours" value={usd(d.usd24h)} />
        <Tile label="Last 7 days" value={usd(d.usd7d)} />
        <Tile label="Last 30 days" value={usd(d.usd30d)} />
      </div>

      {d.stableUsd > 0 ? (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
          Before the token rail, {usd(d.stableUsd)} came in on the stable rail. Kept separate on
          purpose: those were dollars, not {d.symbol}.
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="text-sm font-semibold text-white">Thirty days</div>
        <div className="mt-1 text-[11px] text-gray-600">
          {d.symbol} received per day. Hover for the dollars and the payment count.
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
                    name === "usd" ? [usd(v), "Sold for"] : name === "payments" ? [v, "Payments"] : [num(v, 2), d.symbol]
                  }
                />
                <Area type="monotone" dataKey="token" stroke="#c6ff2e" fill="rgba(198,255,46,.15)" strokeWidth={2} />
                <Area type="monotone" dataKey="usd" stroke="transparent" fill="transparent" />
                <Area type="monotone" dataKey="payments" stroke="transparent" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
        <div className="text-xs uppercase tracking-wider text-gray-500">Where it lands</div>
        <div className="mt-2 break-all font-mono text-[12px] text-gray-300">{d.wallet || "No wallet set"}</div>
        <div className="mt-3 text-xs uppercase tracking-wider text-gray-500">Token</div>
        <div className="mt-1 break-all font-mono text-[12px] text-gray-300">{d.mint || "Not set"}</div>
      </div>
    </div>
  )
}
