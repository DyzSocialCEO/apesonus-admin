"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Check, AlertCircle, Power } from "lucide-react"

/**
 * THE VOICES.
 *
 * A block of character per therapist, and the numbers the conversation runs
 * on. The house block is not on this page and cannot be edited anywhere: it
 * is entertainment, never financial advice, and a patient in real trouble gets
 * a person. Those three ride underneath every character here.
 *
 * The kill switch saves the moment it is pressed. With it on, the therapist
 * still answers, from written lines, and the model is never called.
 */

interface Settings {
  model: string
  fallback_model: string
  max_exchanges: number
  max_reply_chars: number
  daily_spend_cap_cents: number
  kill_switch: boolean
  max_refusals: number
}

interface Voice {
  id: number
  name: string
  bio: string
  prompt: string
  active: boolean
}

const EMPTY: Settings = {
  model: "claude-haiku-4-5-20251001",
  fallback_model: "claude-haiku-4-5-20251001",
  max_exchanges: 4,
  max_reply_chars: 420,
  daily_spend_cap_cents: 500,
  kill_switch: false,
  max_refusals: 3,
}

export function Voices() {
  const [s, setS] = useState<Settings>(EMPTY)
  const [voices, setVoices] = useState<Voice[]>([])
  const [spent, setSpent] = useState(0)
  const [present, setPresent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(() => {
    fetch("/api/admin/voices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the voices"))))
      .then((d) => {
        if (d.settings) setS(d.settings as Settings)
        setVoices(Array.isArray(d.therapists) ? d.therapists : [])
        setSpent(Number(d.spentTodayCents ?? 0))
        setPresent(d.present !== false)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const patch = async (tag: string, payload: Record<string, unknown>) => {
    setBusy(tag)
    setError("")
    try {
      const r = await fetch("/api/admin/voices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      if (d.settings) setS(d.settings as Settings)
      setSaved(tag)
      setTimeout(() => setSaved(""), 1800)
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally {
      setBusy("")
    }
  }

  const saveVoice = async (v: Voice) => {
    setBusy(`v-${v.id}`)
    setError("")
    try {
      const r = await fetch("/api/admin/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, prompt: v.prompt }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "could not save")
      setSaved(`v-${v.id}`)
      setTimeout(() => setSaved(""), 1800)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy("")
    }
  }

  const toggleKill = async () => {
    const want = !s.kill_switch
    setS((c) => ({ ...c, kill_switch: want }))
    const ok = await patch("kill", { kill_switch: want })
    if (!ok) setS((c) => ({ ...c, kill_switch: !want }))
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the voices
      </p>
    )
  }

  const capped = s.daily_spend_cap_cents > 0 && spent >= s.daily_spend_cap_cents

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>The conversation</CardTitle>
          <CardDescription>
            How a session runs. The character of each therapist is below; these are the rules every one
            of them works inside. The house block, which holds no financial advice and the crisis rule,
            is not editable anywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!present ? (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                The therapist_ai row is not in the database yet. Run 120_the_conversation.sql, then reload.
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={toggleKill}
            disabled={busy === "kill"}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${
              s.kill_switch ? "border-red-800 bg-red-950/40" : "border-gray-700 bg-gray-900/60"
            }`}
          >
            <span>
              <span className={`flex items-center gap-2 text-base font-semibold ${s.kill_switch ? "text-red-400" : "text-gray-300"}`}>
                <Power className="w-4 h-4" />
                {s.kill_switch ? "The model is switched off" : "The model is answering"}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {s.kill_switch
                  ? "Sessions still run. The therapist answers from written lines and closes after a few messages."
                  : "Press this and every session falls back to written lines without breaking."}
              </span>
            </span>
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Model</label>
              <Input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
              <p className="text-[11px] text-gray-600 mt-1">Haiku is the cheap default.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Fallback model</label>
              <Input value={s.fallback_model} onChange={(e) => setS({ ...s, fallback_model: e.target.value })} />
              <p className="text-[11px] text-gray-600 mt-1">Tried once if the first one fails.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Messages per session</label>
              <Input
                type="number"
                value={s.max_exchanges}
                onChange={(e) => setS({ ...s, max_exchanges: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">The therapist can still close it earlier.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Longest reply, characters</label>
              <Input
                type="number"
                value={s.max_reply_chars}
                onChange={(e) => setS({ ...s, max_reply_chars: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Nonsense allowed</label>
              <Input
                type="number"
                value={s.max_refusals}
                onChange={(e) => setS({ ...s, max_refusals: Number(e.target.value) })}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Refusals before the session closes itself. A refusal never costs them a message.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Daily spend cap, cents</label>
              <Input
                type="number"
                value={s.daily_spend_cap_cents}
                onChange={(e) => setS({ ...s, daily_spend_cap_cents: Number(e.target.value) })}
              />
              <p className={`text-[11px] mt-1 ${capped ? "text-red-400" : "text-gray-600"}`}>
                {spent} spent in the last day{capped ? ", cap reached" : ""}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              patch("numbers", {
                model: s.model,
                fallback_model: s.fallback_model,
                max_exchanges: s.max_exchanges,
                max_reply_chars: s.max_reply_chars,
                max_refusals: s.max_refusals,
                daily_spend_cap_cents: s.daily_spend_cap_cents,
              })
            }
            disabled={busy === "numbers"}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy === "numbers" ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === "numbers" ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save the rules
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The voices</CardTitle>
          <CardDescription>
            One block each, in your words. Write how they talk, what they care about and what they are
            like when somebody says something stupid. Leave one empty and that therapist falls back to a
            plain clinic voice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {voices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-600">
              No therapists on staff yet.
            </p>
          ) : (
            voices.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-800 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-white">{v.name}</span>
                  {!v.active ? <span className="text-[11px] text-gray-600">off staff</span> : null}
                  <span className="ml-auto text-[11px] text-gray-600">{v.prompt.length} characters</span>
                </div>
                <textarea
                  value={v.prompt}
                  onChange={(e) =>
                    setVoices((list) => list.map((x) => (x.id === v.id ? { ...x, prompt: e.target.value } : x)))
                  }
                  rows={6}
                  placeholder={`You are ${v.name}. Write how they talk here.`}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-[12.5px] leading-relaxed text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => saveVoice(v)}
                  disabled={busy === `v-${v.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-60"
                >
                  {busy === `v-${v.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : saved === `v-${v.id}` ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                  Save {v.name}
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
