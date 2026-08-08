"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Activity, Users, Plus, Trash2, Lock, Unlock, Star } from "lucide-react"

/**
 * /dashboard/ward, THE WARD desk.
 *
 * The staff, their prescriptions and dose targets, the admission plans, the
 * buy link, and today's clip. Nothing here is written into the app: changing
 * any of it changes the app on the next page load, with no deploy.
 *
 * The instant switches (featured, on staff / off staff, unlock) save the
 * moment they are pressed. Text fields save behind their own button.
 */

interface Plan {
  key: string
  name: string
  cents: number
  hours: number
  line: string
  best: boolean
}

interface Rx {
  id: number
  track_id: number
  seq: number
  target: number | null
  line: string
  unlocked: boolean
  doses: number
}

interface Therapist {
  id: number
  name: string
  bio: string
  image: string
  sort: number
  featured: boolean
  active: boolean
  doses: number
  prescriptions: Rx[]
}

interface TrackRow {
  id: number
  title: string
  artist: string
}

interface Clip {
  url: string
  caption: string
}

interface NewRx {
  track_id: string
  seq: string
  target: string
  line: string
}

const EMPTY_RX: NewRx = { track_id: "", seq: "", target: "", line: "" }

export default function WardPage() {
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [buyUrl, setBuyUrl] = useState("")
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [census, setCensus] = useState(0)
  const [admittedNow, setAdmittedNow] = useState(0)
  const [mint, setMint] = useState<string | null>(null)
  const [clip, setClip] = useState<Clip>({ url: "", caption: "" })
  const [day, setDay] = useState("")

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const [hire, setHire] = useState({ name: "", bio: "", image: "", sort: "100" })
  const [newRx, setNewRx] = useState<Record<number, NewRx>>({})

  const load = useCallback(() => {
    fetch("/api/admin/ward", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the ward"))))
      .then((d) => {
        setTherapists(Array.isArray(d.therapists) ? d.therapists : [])
        setPlans(Array.isArray(d.config?.plans) ? d.config.plans : [])
        setBuyUrl(String(d.config?.buy_url ?? ""))
        setTracks(Array.isArray(d.tracks) ? d.tracks : [])
        setCensus(Number(d.census ?? 0))
        setAdmittedNow(Number(d.admittedNow ?? 0))
        setMint(d.mint ?? null)
        setDay(String(d.day ?? ""))
        setClip(d.morningDose ? { url: d.morningDose.url, caption: d.morningDose.caption ?? "" } : { url: "", caption: "" })
        setError("")
      })
      .catch((e) => setError(e instanceof Error ? e.message : "something went wrong"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const flash = (tag: string) => {
    setSaved(tag)
    setTimeout(() => setSaved(""), 2200)
  }

  const post = async (tag: string, payload: Record<string, unknown>) => {
    if (busy) return false
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      flash(tag)
      load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
      return false
    } finally {
      setBusy("")
    }
  }

  const patch = async (tag: string, payload: Record<string, unknown>) => {
    if (busy) return
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      flash(tag)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
    } finally {
      setBusy("")
    }
  }

  const setT = (id: number, part: Partial<Therapist>) =>
    setTherapists((list) => list.map((t) => (t.id === id ? { ...t, ...part } : t)))

  const setRx = (tid: number, rid: number, part: Partial<Rx>) =>
    setTherapists((list) =>
      list.map((t) =>
        t.id === tid
          ? { ...t, prescriptions: t.prescriptions.map((r) => (r.id === rid ? { ...r, ...part } : r)) }
          : t,
      ),
    )

  const setPlan = (key: string, part: Partial<Plan>) =>
    setPlans((list) => list.map((p) => (p.key === key ? { ...p, ...part } : p)))

  const trackName = (id: number) => {
    const t = tracks.find((x) => x.id === id)
    return t ? `${t.title} · ${t.artist}` : `#${id}`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the ward
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">The Ward</h1>
        <p className="text-sm text-gray-500">
          The staff, their prescriptions, the plans, the door. Nothing here is written into the app.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Users className="w-4 h-4" /> Ward census
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{census.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">accounts that have ever been admitted. The app shows this number.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Admitted right now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{admittedNow.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">accounts inside a live admission</p>
          </CardContent>
        </Card>
      </div>

      {/* ── THE STAFF ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>The therapists</CardTitle>
          <CardDescription>
            The starred one leads the ward. FEATURE and ON STAFF save the instant they are pressed;
            names, bios, images and prescriptions save with their own button. Locked prescriptions
            never reach the app, so the next title stays a secret until its target is hit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {therapists.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-800 p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title={t.featured ? "Leading the ward" : "Put this therapist on the ward"}
                  onClick={() => !t.featured && post(`feat-${t.id}`, { what: "therapist_feature", id: t.id })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    t.featured
                      ? "border-yellow-600 bg-yellow-950/40 text-yellow-400"
                      : "border-gray-700 text-gray-400 hover:border-yellow-700 hover:text-yellow-500"
                  }`}
                >
                  <Star className="w-3.5 h-3.5" /> {t.featured ? "FEATURED" : "FEATURE"}
                </button>
                <button
                  type="button"
                  onClick={() => post(`act-${t.id}`, { what: "therapist_active", id: t.id, active: !t.active })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    t.active ? "border-green-800 bg-green-950/40 text-green-400" : "border-gray-700 text-gray-500"
                  }`}
                >
                  {t.active ? "ON STAFF" : "OFF STAFF"}
                </button>
                <span className="ml-auto text-xs text-gray-500">
                  {t.doses.toLocaleString("en-US")} doses lifetime
                </span>
                <button
                  type="button"
                  title="Remove this therapist and their prescriptions"
                  onClick={() => {
                    if (window.confirm(`Remove ${t.name} and every prescription attached? Doses already counted stay in the ledger.`)) {
                      post(`del-${t.id}`, { what: "therapist_delete", id: t.id })
                    }
                  }}
                  className="rounded-lg border border-gray-800 p-1.5 text-gray-500 hover:border-red-900 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                  <Input value={t.name} onChange={(e) => setT(t.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Sort (low sits first)</label>
                  <Input
                    type="number"
                    value={t.sort}
                    onChange={(e) => setT(t.id, { sort: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Bio, one or two lines</label>
                <textarea
                  value={t.bio}
                  onChange={(e) => setT(t.id, { bio: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Character image link (Bunny, like the covers). Empty = the app shows the current cover art.
                </label>
                <Input
                  value={t.image}
                  placeholder="https://..."
                  onChange={(e) => setT(t.id, { image: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  post(`tsave-${t.id}`, {
                    what: "therapist_save",
                    id: t.id,
                    name: t.name,
                    bio: t.bio,
                    image: t.image,
                    sort: t.sort,
                  })
                }
                disabled={busy === `tsave-${t.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {busy === `tsave-${t.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === `tsave-${t.id}` ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                Save the therapist
              </button>

              {/* ── PRESCRIPTIONS ── */}
              <div className="space-y-3 border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold tracking-wider text-gray-400">PRESCRIPTIONS</div>
                {t.prescriptions.map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-800 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${r.unlocked ? "bg-green-950/50 text-green-400" : "bg-gray-900 text-gray-400"}`}>
                        {r.unlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {r.unlocked ? "ON THE WARD" : "LOCKED"}
                      </span>
                      <span className="text-gray-500">{r.doses.toLocaleString("en-US")} doses</span>
                      {!r.unlocked ? (
                        <button
                          type="button"
                          onClick={() => post(`unlock-${r.id}`, { what: "rx_unlock", id: r.id })}
                          className="rounded border border-gray-700 px-2 py-1 font-semibold text-gray-300 hover:border-green-800 hover:text-green-400"
                        >
                          UNLOCK NOW
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove this prescription? Its doses stay in the ledger.")) {
                            post(`rxdel-${r.id}`, { what: "rx_delete", id: r.id })
                          }
                        }}
                        className="ml-auto rounded border border-gray-800 p-1 text-gray-500 hover:border-red-900 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <label className="block text-[11px] text-gray-500 mb-1">Track</label>
                        <select
                          value={r.track_id}
                          onChange={(e) => setRx(t.id, r.id, { track_id: Number(e.target.value) })}
                          className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-2 text-sm text-white"
                        >
                          <option value={r.track_id}>{trackName(r.track_id)}</option>
                          {tracks
                            .filter((x) => x.id !== r.track_id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title} · {x.artist}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Prescription #</label>
                        <Input type="number" value={r.seq} onChange={(e) => setRx(t.id, r.id, { seq: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Dose target to unlock</label>
                        <Input
                          type="number"
                          value={r.target ?? ""}
                          placeholder="none"
                          onChange={(e) => setRx(t.id, r.id, { target: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">One line of character copy under the title, optional</label>
                      <Input value={r.line} onChange={(e) => setRx(t.id, r.id, { line: e.target.value })} />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        post(`rxsave-${r.id}`, {
                          what: "rx_save",
                          id: r.id,
                          therapist_id: t.id,
                          track_id: r.track_id,
                          seq: r.seq,
                          target: r.target,
                          line: r.line,
                        })
                      }
                      disabled={busy === `rxsave-${r.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-200 disabled:opacity-60"
                    >
                      {busy === `rxsave-${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved === `rxsave-${r.id}` ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      Save the prescription
                    </button>
                  </div>
                ))}

                {/* add a prescription */}
                <div className="rounded-lg border border-dashed border-gray-800 p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Track</label>
                      <select
                        value={(newRx[t.id] ?? EMPTY_RX).track_id}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), track_id: e.target.value } }))}
                        className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-2 text-sm text-white"
                      >
                        <option value="">Pick a track</option>
                        {tracks.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.title} · {x.artist}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Prescription #</label>
                      <Input
                        type="number"
                        placeholder={String(t.prescriptions.length + 1)}
                        value={(newRx[t.id] ?? EMPTY_RX).seq}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), seq: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Dose target to unlock</label>
                      <Input
                        type="number"
                        placeholder="10000"
                        value={(newRx[t.id] ?? EMPTY_RX).target}
                        onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), target: e.target.value } }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">One line of character copy, optional</label>
                    <Input
                      value={(newRx[t.id] ?? EMPTY_RX).line}
                      onChange={(e) => setNewRx((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? EMPTY_RX), line: e.target.value } }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const v = newRx[t.id] ?? EMPTY_RX
                      const ok = await post(`rxadd-${t.id}`, {
                        what: "rx_save",
                        therapist_id: t.id,
                        track_id: v.track_id === "" ? null : Number(v.track_id),
                        seq: v.seq === "" ? t.prescriptions.length + 1 : Number(v.seq),
                        target: v.target === "" ? null : Number(v.target),
                        line: v.line,
                      })
                      if (ok) setNewRx((m) => ({ ...m, [t.id]: EMPTY_RX }))
                    }}
                    disabled={busy === `rxadd-${t.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-200 disabled:opacity-60"
                  >
                    {busy === `rxadd-${t.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add the prescription
                  </button>
                  <p className="text-[11px] text-gray-600">
                    Prescription 1 goes on the ward the moment it is added. Every later one needs a dose
                    target and unlocks itself when the therapist reaches it.
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* hire a therapist */}
          <div className="rounded-xl border border-dashed border-gray-800 p-4 space-y-3">
            <div className="text-xs font-semibold tracking-wider text-gray-400">HIRE A THERAPIST</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                <Input value={hire.name} placeholder="SHIM LIQUIDATION" onChange={(e) => setHire({ ...hire, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Sort</label>
                <Input type="number" value={hire.sort} onChange={(e) => setHire({ ...hire, sort: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Bio</label>
              <textarea
                value={hire.bio}
                onChange={(e) => setHire({ ...hire, bio: e.target.value })}
                rows={2}
                className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Character image link, optional</label>
              <Input value={hire.image} placeholder="https://..." onChange={(e) => setHire({ ...hire, image: e.target.value })} />
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await post("hire", {
                  what: "therapist_save",
                  name: hire.name,
                  bio: hire.bio,
                  image: hire.image,
                  sort: Number(hire.sort) || 100,
                })
                if (ok) setHire({ name: "", bio: "", image: "", sort: "100" })
              }}
              disabled={busy === "hire"}
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy === "hire" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Hire
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── ADMISSION PLANS ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Admission plans</CardTitle>
          <CardDescription>
            The three doors. Prices are in cents, stays in hours (24 = a day, 168 = a week, 720 = a month).
            MOST PRESCRIBED marks one plan with the badge in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plans.map((p) => (
            <div key={p.key} className="rounded-lg border border-gray-800 p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Name</label>
                  <Input value={p.name} onChange={(e) => setPlan(p.key, { name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Price, cents</label>
                  <Input type="number" value={p.cents} onChange={(e) => setPlan(p.key, { cents: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Stay, hours</label>
                  <Input type="number" value={p.hours} onChange={(e) => setPlan(p.key, { hours: Number(e.target.value) })} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setPlans((list) => list.map((x) => ({ ...x, best: x.key === p.key ? !p.best : false })))}
                    className={`w-full rounded-lg border px-2 py-2 text-xs font-semibold ${
                      p.best ? "border-yellow-600 bg-yellow-950/40 text-yellow-400" : "border-gray-700 text-gray-400"
                    }`}
                  >
                    {p.best ? "MOST PRESCRIBED" : "Mark most prescribed"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">One line under the price</label>
                <Input value={p.line} onChange={(e) => setPlan(p.key, { line: e.target.value })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch("plans", { plans })}
            disabled={busy === "plans"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "plans" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "plans" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the plans
          </button>
        </CardContent>
      </Card>

      {/* ── MORNING DOSE ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s Morning Dose</CardTitle>
          <CardDescription>
            The clip for {day}. Upload the file to Bunny like a cover, then paste the link here.
            Clearing the link takes the card off the ward. Tomorrow starts empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Clip link</label>
            <Input value={clip.url} placeholder="https://..." onChange={(e) => setClip({ ...clip, url: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Caption, optional</label>
            <Input value={clip.caption} onChange={(e) => setClip({ ...clip, caption: e.target.value })} />
          </div>
          <button
            type="button"
            onClick={() => post("clip", { what: "clip", ...clip })}
            disabled={busy === "clip"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "clip" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "clip" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the clip
          </button>
        </CardContent>
      </Card>

      {/* ── THE DOOR ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>The door</CardTitle>
          <CardDescription>
            The CA the app shows inside the admission step is the payment mint from Settings, so a
            wrong address and a broken checkout are the same fault. It no longer sits in the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">BUY $PUMP link, optional override</label>
            <Input value={buyUrl} placeholder="https://pump.fun/coin/..." onChange={(e) => setBuyUrl(e.target.value)} />
            <p className="text-[11px] text-gray-600 mt-1">Empty = the app links straight to the mint on pump.fun.</p>
          </div>
          <button
            type="button"
            onClick={() => patch("buy", { buy_url: buyUrl })}
            disabled={busy === "buy"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "buy" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "buy" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the link
          </button>
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <div className="text-[11px] text-gray-500">The mint the app publishes (changed on the payments card in Settings)</div>
            <div className="mt-1 break-all font-mono text-xs text-gray-300">{mint ?? "not set"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
