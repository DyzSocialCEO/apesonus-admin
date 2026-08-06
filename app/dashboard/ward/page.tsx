"use client"

/**
 * /dashboard/ward — THE WARD CHECK desk.
 *
 * Write the days ahead of time: the doctor's line and the answers under it.
 * The app shows today's row by itself. Past rows carry what the room
 * actually answered, which is the material for the next day's line.
 */

import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Save } from "lucide-react"

type Day = {
  day: string
  line: string
  options: string[]
  verdict: string | null
  counts: number[]
  total: number
}

function nextFreeDay(days: Day[]): string {
  const taken = new Set(days.map((d) => d.day))
  const d = new Date()
  for (let i = 0; i < 400; i += 1) {
    const key = d.toISOString().slice(0, 10)
    if (!taken.has(key)) return key
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return new Date().toISOString().slice(0, 10)
}

export default function WardPage() {
  const [days, setDays] = useState<Day[]>([])
  const [today, setToday] = useState("")
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")

  const [day, setDay] = useState("")
  const [line, setLine] = useState("")
  const [optA, setOptA] = useState("")
  const [optB, setOptB] = useState("")
  const [optC, setOptC] = useState("")
  const [optD, setOptD] = useState("")
  const [verdict, setVerdict] = useState("")

  const load = () => {
    setLoading(true)
    fetch("/api/admin/ward", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = (d?.days ?? []) as Day[]
        setDays(list)
        setToday(String(d?.today ?? ""))
        setDay((cur) => cur || nextFreeDay(list))
      })
      .catch(() => setNote("Could not load."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const save = async () => {
    const options = [optA, optB, optC, optD].map((o) => o.trim()).filter(Boolean)
    if (line.trim().length < 3 || options.length < 2) {
      setNote("A line and at least two answers.")
      return
    }
    setNote("")
    const r = await fetch("/api/admin/ward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, line: line.trim(), options, verdict: verdict.trim() || null }),
    })
    const d = await r.json()
    if (!r.ok) {
      setNote(String(d?.error || "Did not save."))
      return
    }
    setLine("")
    setOptA("")
    setOptB("")
    setOptC("")
    setOptD("")
    setVerdict("")
    setNote("Saved.")
    load()
  }

  const edit = (d: Day) => {
    setDay(d.day)
    setLine(d.line)
    setOptA(d.options[0] ?? "")
    setOptB(d.options[1] ?? "")
    setOptC(d.options[2] ?? "")
    setOptD(d.options[3] ?? "")
    setVerdict(d.verdict ?? "")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const remove = async (d: string) => {
    await fetch(`/api/admin/ward?day=${d}`, { method: "DELETE" })
    load()
  }

  const field =
    "w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-gray-600"

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <h1 className="text-2xl font-bold text-white">The Ward Check</h1>
      <p className="mt-1 text-gray-400">
        One line a day and the answers under it. Patients confess, the count becomes tomorrow&rsquo;s
        opening joke. Write a week at a time; the app takes it from here.
      </p>

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Day (UTC)</label>
            <input className={`${field} mt-1`} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Dr. Onus says</label>
            <input
              className={`${field} mt-1`}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="You are allowed to miss a pump. The market will prepare another bad decision before lunch."
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Answer 1</label>
            <input className={`${field} mt-1`} value={optA} onChange={(e) => setOptA(e.target.value)} placeholder="I LET IT GO" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Answer 2</label>
            <input className={`${field} mt-1`} value={optB} onChange={(e) => setOptB(e.target.value)} placeholder="I BOUGHT THE TOP" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Answer 3 (weekly only)</label>
            <input className={`${field} mt-1`} value={optC} onChange={(e) => setOptC(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">Answer 4 (weekly only)</label>
            <input className={`${field} mt-1`} value={optD} onChange={(e) => setOptD(e.target.value)} />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs uppercase tracking-wider text-gray-500">
            Verdict printed under this day&rsquo;s result (optional)
          </label>
          <input
            className={`${field} mt-1`}
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            placeholder="Treatment remains ineffective."
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-black"
          >
            <Save className="h-4 w-4" /> Save day
          </button>
          <button
            type="button"
            onClick={() => setDay(nextFreeDay(days))}
            className="flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300"
          >
            <Plus className="h-4 w-4" /> Next free day
          </button>
          {note ? <span className="text-sm text-gray-400">{note}</span> : null}
        </div>
      </div>

      <div className="mt-8">
        <div className="text-xs uppercase tracking-wider text-gray-500">The schedule</div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
          </div>
        ) : days.length === 0 ? (
          <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900 p-5 text-gray-500">
            Nothing scheduled. The app shows no ward check until a day is written here.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {days.map((d) => (
              <div key={d.day} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-sm text-white">{d.day}</span>
                  {d.day === today ? (
                    <span className="rounded bg-yellow-600 px-2 py-0.5 text-[10px] font-bold text-black">
                      LIVE TODAY
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-500">
                    {d.total} {d.total === 1 ? "answer" : "answers"}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => edit(d)} className="text-xs text-gray-400 hover:text-white">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(d.day)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-200">{d.line}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.options.map((o, i) => (
                    <span key={i} className="rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-300">
                      {o}
                      <span className="ml-2 text-gray-500">
                        {d.counts[i] ?? 0}
                        {d.total > 0 ? ` · ${Math.round(((d.counts[i] ?? 0) / d.total) * 100)}%` : ""}
                      </span>
                    </span>
                  ))}
                </div>
                {d.verdict ? <div className="mt-2 text-xs italic text-gray-500">{d.verdict}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
