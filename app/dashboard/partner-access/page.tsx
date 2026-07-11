"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2, Plus, Trash2, Check, UserPlus, ShieldCheck, ShieldOff, RotateCcw } from "lucide-react"

type Account = { id: string; email: string; partner_id: number; partner_name: string; is_active: boolean; must_change_password: boolean; created_at: string }
type Partner = { id: number; name: string }

export default function PartnerAccessPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [partnerId, setPartnerId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState("")

  const load = () => {
    fetch("/api/admin/partner-accounts", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { setAccounts(d.accounts || []); setPartners(d.partners || []) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const create = async () => {
    setBusy(true); setErr(""); setDone(false)
    try {
      const r = await fetch("/api/admin/partner-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partner_id: Number(partnerId), email, password }) })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || "Could not create"); return }
      setDone(true); setEmail(""); setPassword(""); setPartnerId(""); setTimeout(() => setDone(false), 1500); load()
    } catch { setErr("Could not create") } finally { setBusy(false) }
  }
  const toggle = async (a: Account) => {
    await fetch(`/api/admin/partner-accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !a.is_active }) }); load()
  }
  const reset = async (a: Account) => {
    const pw = typeof window !== "undefined" ? window.prompt(`New password for ${a.email} (min 8 chars):`) : null
    if (!pw) return
    const r = await fetch(`/api/admin/partner-accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) })
    const j = await r.json(); if (!r.ok) alert(j.error || "Could not reset"); else load()
  }
  const del = async (a: Account) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete login for ${a.email}? Their access is revoked immediately. The partner's payout record is untouched.`)) return
    await fetch(`/api/admin/partner-accounts/${a.id}`, { method: "DELETE" }); load()
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-white">Partner Access</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Read-only logins for investors. Each is linked to a partner and sees only total gross, the split, and their own cut — never anyone else&apos;s. Send them the email + starting password; they change it on first login.
      </p>

      {/* create */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4"><UserPlus className="w-5 h-5 text-primary" /><h2 className="font-semibold text-white">New partner login</h2></div>
        {partners.length === 0 ? (
          <p className="text-sm text-gray-500">Add a partner on the <span className="text-primary">Distribution</span> page first — then you can create their login here.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600">Partner</label>
                <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary">
                  <option value="">Select…</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="investor@email.com" className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600">Starting password</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              {err ? <p className="text-xs text-red-400">{err}</p> : <span className="text-[11px] text-gray-600">They&apos;ll be asked to change this password after first login.</span>}
              <button onClick={create} disabled={busy} className="flex items-center gap-2 bg-primary text-gray-950 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {done ? "Created" : "Create login"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* list */}
      <div className="flex items-center gap-2 mb-3"><KeyRound className="w-4 h-4 text-gray-500" /><h2 className="font-semibold text-white">Logins <span className="text-gray-600 text-sm font-normal">({accounts.length})</span></h2></div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center text-sm text-gray-600">No partner logins yet.</div>
      ) : (
        <div className="space-y-2.5">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white truncate">{a.email}</span>
                  {a.is_active
                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-green-400 border border-green-500/30">ACTIVE</span>
                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-gray-500 border border-gray-700">DISABLED</span>}
                  {a.must_change_password && <span className="text-[10px] px-1.5 py-0.5 rounded text-yellow-400 border border-yellow-500/30">must change pw</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">→ {a.partner_name}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggle(a)} title={a.is_active ? "Disable" : "Enable"} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
                  {a.is_active ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </button>
                <button onClick={() => reset(a)} title="Reset password" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"><RotateCcw className="w-4 h-4" /></button>
                <button onClick={() => del(a)} title="Delete login" className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
