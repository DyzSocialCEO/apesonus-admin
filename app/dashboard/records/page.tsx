"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, FolderOpen, Trash2 } from "lucide-react"

/**
 * /dashboard/records
 *
 * THE FILING CABINET.
 *
 * One case file at a time. Pick the song, write what happened to the patient,
 * file it. The clinic works out the rest: the therapist from the track, the
 * condition from the track, and a patient number drawn at random.
 *
 * The number is burned the moment it is used. No real patient will ever be
 * given it, and removing the case does not hand it back, because a number that
 * came back around would put a stranger's face on a file people have read.
 *
 * Only songs that are NOT on the ward can be filed. A song is either something
 * the clinic prescribed or something that happened to a patient, never both.
 */

interface Track {
  id: number
  title: string
  artist: string
  condition: string
  cover: string
  duration: number
}

interface Filed {
  id: string
  patientNo: number
  trackId: number
  title: string
  therapist: string
  condition: string
  cover: string
  note: string
  doses: number
  at: string
}

export default function RecordsPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  const [available, setAvailable] = useState<Track[]>([])
  const [filed, setFiled] = useState<Filed[]>([])

  const [pick, setPick] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editNote, setEditNote] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/records", { cache: "no-store" })
      const d = await r.json().catch(() => null)
      setAvailable(d?.available ?? [])
      setFiled(d?.filed ?? [])
    } catch {
      setErr(true)
      setSaid("Could not read the desk.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const post = async (body: Record<string, unknown>, key: string, done: string) => {
    setBusy(key)
    setSaid(null)
    setErr(false)
    try {
      const r = await fetch("/api/admin/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) {
        setErr(true)
        setSaid(d?.error || "That did not go through.")
      } else {
        setSaid(d?.patientNo ? `${done} Filed as PATIENT #${d.patientNo}.` : done)
        setPick(null)
        setNote("")
        setEditing(null)
        await load()
      }
    } catch {
      setErr(true)
      setSaid("That did not go through.")
    } finally {
      setBusy(null)
    }
  }

  const shown = available.filter((t) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-7 h-7 text-violet-400" />
            The Records
          </h1>
          <p className="text-gray-400">
            Case files the clinic writes. Pick a song, say what happened to the patient. The patient
            number is drawn here and never given to a real person.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {said ? (
        <div className={`p-3 rounded-lg text-sm ${err ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {said}
        </div>
      ) : null}

      {/* ── FILE A NEW ONE ─────────────────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">File a case</CardTitle>
          <CardDescription>
            Only songs that are not on the ward appear here. A song is either something the clinic
            prescribed or something that happened to a patient, never both.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Find a song ({available.length} available)
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or artist"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800/60">
            {shown.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                {available.length === 0
                  ? "Every track is either on the ward or already filed. Upload another in Tracks."
                  : "Nothing matches that."}
              </p>
            ) : (
              shown.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPick(t.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-800/40 ${
                    pick === t.id ? "bg-violet-500/10" : ""
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate">{t.title}</span>
                    <span className="block text-xs text-gray-500 truncate">{t.artist}</span>
                  </span>
                  <span className="text-[10px] text-gray-500">{t.condition}</span>
                  {pick === t.id ? <span className="text-[10px] text-violet-400">PICKED</span> : null}
                </button>
              ))
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              What happened to the patient
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="One or two lines. This is the only thing anybody reads on the card."
              className="w-full rounded-lg bg-gray-950 border border-gray-800 p-3 text-sm text-white placeholder:text-gray-600"
            />
          </div>

          <Button
            disabled={busy !== null || pick === null || !note.trim()}
            onClick={() => post({ what: "file", trackId: pick, note }, "file", "Filed.")}
          >
            {busy === "file" ? "Filing…" : "File it"}
          </Button>
        </CardContent>
      </Card>

      {/* ── WHAT IS ON THE RECORD ──────────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">On the record ({filed.length})</CardTitle>
          <CardDescription>
            What patients see under THE RECORDS. Removing one takes it off the record and keeps its
            number retired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            </div>
          ) : filed.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing filed yet.</p>
          ) : (
            filed.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-800 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">{c.title}</span>
                  <span className="text-xs text-gray-500">
                    {c.therapist} &middot; PATIENT #{c.patientNo} &middot; {c.condition}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{c.doses} doses</span>
                </div>

                {editing === c.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg bg-gray-950 border border-gray-800 p-3 text-sm text-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => post({ what: "edit", caseId: c.id, note: editNote }, `edit-${c.id}`, "Changed.")}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-gray-400">{c.note}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(c.id)
                          setEditNote(c.note)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => post({ what: "remove", caseId: c.id }, `rm-${c.id}`, "Off the record.")}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
