"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Activity, Music } from "lucide-react"

/**
 * /dashboard/ward — THE WARD desk.
 *
 * The four things the app will not let anybody hardcode: which song is on the
 * ward, how many doses the mission needs, what admission costs, and how long
 * it lasts. Changing any of them here changes the app on the next page load,
 * with no deploy.
 */

interface WardConfig {
  buy_url: string
  track_id: number | null
  track_title: string
  mission_target: number
  admission_hours: number
  admission_usd_cents: number
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

interface Check {
  question: string
  optionA: string
  optionB: string
}

export default function WardPage() {
  const [config, setConfig] = useState<WardConfig | null>(null)
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [wardDoses, setWardDoses] = useState(0)
  const [admittedNow, setAdmittedNow] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const [clip, setClip] = useState<Clip>({ url: "", caption: "" })
  const [check, setCheck] = useState<Check>({ question: "", optionA: "", optionB: "" })
  const [votesA, setVotesA] = useState(0)
  const [votesB, setVotesB] = useState(0)
  const [day, setDay] = useState("")
  const [busy, setBusy] = useState("")
  const [mint, setMint] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch("/api/admin/ward", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the ward"))))
      .then((d) => {
        setConfig(d.config)
        setTracks(Array.isArray(d.tracks) ? d.tracks : [])
        setWardDoses(Number(d.wardDoses ?? 0))
        setAdmittedNow(Number(d.admittedNow ?? 0))
        setDay(String(d.day ?? ""))
        setClip(d.morningDose ? { url: d.morningDose.url, caption: d.morningDose.caption ?? "" } : { url: "", caption: "" })
        setCheck(d.check ?? { question: "", optionA: "", optionB: "" })
        setVotesA(Number(d.votesA ?? 0))
        setVotesB(Number(d.votesB ?? 0))
        setMint(d.mint ?? null)
        setError("")
      })
      .catch((e) => setError(e instanceof Error ? e.message : "something went wrong"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const save = async () => {
    if (!config || saving) return
    setSaving(true)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      setConfig(d.config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof WardConfig>(key: K, value: WardConfig[K]) =>
    setConfig((c) => (c ? { ...c, [key]: value } : c))

  const post = async (what: "clip" | "check", payload: Clip | Check) => {
    if (busy) return
    setBusy(what)
    setError("")
    try {
      const r = await fetch("/api/admin/ward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what, ...payload }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save")
    } finally {
      setBusy("")
    }
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
          One song, one mission, one door. Nothing here is written into the app.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Doses administered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{wardDoses.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">
              of {config ? config.mission_target.toLocaleString("en-US") : "0"} needed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Music className="w-4 h-4" /> Admitted right now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{admittedNow.toLocaleString("en-US")}</div>
            <p className="text-xs text-gray-500 mt-1">accounts inside a live admission</p>
          </CardContent>
        </Card>
      </div>

      {config ? (
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              The song is picked by id. The title below is only the fallback used if the
              id is ever cleared or points at something inactive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">The song on the ward</label>
              <select
                value={config.track_id ?? ""}
                onChange={(e) => set("track_id", e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white"
              >
                <option value="">Match by title instead</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.artist}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fallback title</label>
                <Input
                  value={config.track_title}
                  onChange={(e) => set("track_title", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Mission target, in doses</label>
                <Input
                  inputMode="numeric"
                  value={String(config.mission_target)}
                  onChange={(e) => set("mission_target", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Admission price, in cents</label>
                <Input
                  inputMode="numeric"
                  value={String(config.admission_usd_cents)}
                  onChange={(e) => set("admission_usd_cents", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  100 is a dollar. This is what the pay sheet charges.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">BUY $PUMP link</label>
                <Input
                  value={config.buy_url}
                  placeholder="Leave blank to use pump.fun for the mint below"
                  onChange={(e) => set("buy_url", e.target.value)}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  The contract address shown in the app is the mint the payment rail
                  already uses{mint ? `: ${mint}` : ", which is not set yet"}. It is never typed
                  into the app, so the address people copy is always the one payments accept.
                  Change it on the payments card in Settings.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Hours per admission</label>
                <Input
                  inputMode="numeric"
                  value={String(config.admission_hours)}
                  onChange={(e) => set("admission_hours", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                />
              </div>
            </div>

            {error ? (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving" : saved ? "Saved" : "Save the ward"}
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s Morning Dose</CardTitle>
          <CardDescription>
            The clip for {day || "today"}. Upload the file to Bunny like a cover, then paste the
            link here. Clearing the link takes the card off the ward. Tomorrow starts empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Clip link</label>
            <Input
              value={clip.url}
              placeholder="https://..."
              onChange={(e) => setClip({ ...clip, url: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Caption, optional</label>
            <Input
              value={clip.caption}
              onChange={(e) => setClip({ ...clip, caption: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => post("clip", clip)}
            disabled={busy === "clip"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "clip" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save the clip
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s Ward Check</CardTitle>
          <CardDescription>
            One question for {day || "today"}, two answers, one vote per patient. Clearing the
            question takes the panel off the ward. Votes already cast stay against the day, so the
            split below is live while you edit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">The question</label>
            <Input
              value={check.question}
              placeholder="If this drops another 50%, are you buying?"
              onChange={(e) => setCheck({ ...check, question: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Answer A</label>
              <Input value={check.optionA} onChange={(e) => setCheck({ ...check, optionA: e.target.value })} />
              <p className="text-[11px] text-gray-500 mt-1">{votesA.toLocaleString("en-US")} votes</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Answer B</label>
              <Input value={check.optionB} onChange={(e) => setCheck({ ...check, optionB: e.target.value })} />
              <p className="text-[11px] text-gray-500 mt-1">{votesB.toLocaleString("en-US")} votes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => post("check", check)}
            disabled={busy === "check"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "check" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save the question
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
