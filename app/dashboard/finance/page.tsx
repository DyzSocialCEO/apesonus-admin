"use client"

/**
 * /dashboard/finance
 * The parent money surface. Spins invariant, cash position, per-feature
 * P&L, obligations. Revenue, Distribution, and Payouts are the drill-downs.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, ArrowUpRight } from "lucide-react"

type Fin = {
  reconcile: any
  blended_cents_per_spin: number | null
  pnl: any
}

const usd = (cents: number) => `$${((cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const n = (v: number) => (v || 0).toLocaleString("en-US")

export default function FinancePage() {
  const [d, setD] = useState<Fin | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/finance")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setD(j)))
      .catch((e) => setErr(String(e)))
  }, [])

  if (err) return <div className="p-6 text-red-400">Finance failed to load: {err}</div>
  if (!d) return <div className="p-6 text-gray-400">Loading the books...</div>

  const s = d.reconcile?.spins || {}
  const u = d.reconcile?.usdc_cents || {}
  const p = d.pnl || {}
  const netCash = (Number(u.house) || 0) + (Number(u.treasury_obligation) || 0) - (Number(u.paid_out_total) || 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Finance</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/revenue" className="text-gray-400 hover:text-white flex items-center gap-1">Revenue <ArrowUpRight className="w-3 h-3" /></Link>
          <Link href="/dashboard/distribution" className="text-gray-400 hover:text-white flex items-center gap-1">Distribution <ArrowUpRight className="w-3 h-3" /></Link>
          <Link href="/dashboard/payouts" className="text-gray-400 hover:text-white flex items-center gap-1">Payouts <ArrowUpRight className="w-3 h-3" /></Link>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle className="text-lg text-white">Spins invariant</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            {s.ok
              ? <span className="flex items-center gap-2 text-green-400"><CheckCircle2 className="w-5 h-5" /> Books balance. Ledger net equals balances.</span>
              : <span className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" /> DRIFT: {n(s.drift)} Spins. Ledger and balances disagree. Stop payouts and investigate.</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div><p className="text-gray-500">Credits</p><p className="text-white font-mono">{n(s.credits)}</p></div>
            <div><p className="text-gray-500">Debits</p><p className="text-white font-mono">{n(s.debits)}</p></div>
            <div><p className="text-gray-500">Outstanding</p><p className="text-white font-mono">{n(s.balances_total)}</p></div>
            <div><p className="text-gray-500">Locked</p><p className="text-white font-mono">{n(s.locked_total)}</p></div>
            <div><p className="text-gray-500">Blended value</p><p className="text-white font-mono">{d.blended_cents_per_spin != null ? `${d.blended_cents_per_spin.toFixed(2)}c / Spin` : "n/a"}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle className="text-lg text-white">USDC position</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Gross in</p><p className="text-white font-mono">{usd(u.gross)}</p></div>
            <div><p className="text-gray-500">House</p><p className="text-white font-mono">{usd(u.house)}</p></div>
            <div><p className="text-gray-500">Prize obligation</p><p className="text-white font-mono">{usd(u.treasury_obligation)}</p></div>
            <div><p className="text-gray-500">Paid out</p><p className="text-white font-mono">{usd(u.paid_out_total)}</p></div>
            <div><p className="text-gray-500">Partner owed</p><p className="text-white font-mono">{usd(u.partner_owed)}</p></div>
            <div><p className="text-gray-500">Open Call pot ceilings</p><p className="text-white font-mono">${n(u.conviction_open_pot_ceilings_usd)}</p></div>
            <div><p className="text-gray-500">Queued Call prizes</p><p className="text-white font-mono">${n(u.conviction_queued_prizes_usd)}</p></div>
            <div><p className="text-gray-500">Net held (gross minus paid)</p><p className="text-white font-mono">{usd(netCash)}</p></div>
          </div>
          <p className="text-xs text-gray-600 mt-3">Open pot ceilings are the max the house could ever owe on live Call contests. The payout wallet float must cover this number.</p>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle className="text-lg text-white">Per feature</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-semibold mb-2">Music</p>
              <p className="text-gray-500">Spins burned on plays</p><p className="text-white font-mono mb-2">{n(p.music?.spins_burned)}</p>
              <p className="text-gray-500">Free plays served</p><p className="text-white font-mono">{n(p.music?.free_plays_served)}</p>
            </div>
            <div className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-semibold mb-2">Back</p>
              <p className="text-gray-500">Rounds settled</p><p className="text-white font-mono mb-2">{n(p.back?.rounds_settled)}</p>
              <p className="text-gray-500">Pool Spins paid</p><p className="text-white font-mono">{n(p.back?.pool_spins_paid)}</p>
            </div>
            <div className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-semibold mb-2">Call</p>
              <p className="text-gray-500">Calls made</p><p className="text-white font-mono mb-2">{n(p.conviction?.calls)}</p>
              <p className="text-gray-500">Entry Spins collected</p><p className="text-white font-mono">{n(p.conviction?.entry_spins)}</p>
            </div>
            <div className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-semibold mb-2">Referrals</p>
              <p className="text-gray-500">Commission Spins paid</p><p className="text-white font-mono mb-2">{n(p.referrals?.commission_spins)}</p>
              <p className="text-gray-500">All grants total</p><p className="text-white font-mono">{n(p.grants_total_spins)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
