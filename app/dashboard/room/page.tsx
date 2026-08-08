"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Eye, EyeOff, Star, AlertCircle } from "lucide-react"

/**
 * /dashboard/room — THE WAITING ROOM desk.
 *
 * Two powers, deliberately: take a confession out of the room, and pin one as
 * SEEN BY DR. ONUS. Nothing here deletes anything, and hidden rows stay on
 * this page so the record survives the decision.
 */

interface Row {
  id: string
  number: number | null
  body: string
  createdAt: string
  hidden: boolean
  featured: boolean
  sameCondition: number
}

export default function RoomPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [showHidden, setShowHidden] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch("/api/admin/room", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not read the room"))))
      .then((d) => {
        setRows(Array.isArray(d.confessions) ? d.confessions : [])
        setTotal(Number(d.total ?? 0))
        setHiddenCount(Number(d.hiddenCount ?? 0))
        setError("")
      })
      .catch((e) => setError(e instanceof Error ? e.message : "something went wrong"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const change = async (id: string, payload: Record<string, boolean>) => {
    if (busy) return
    setBusy(id)
    setError("")
    try {
      const r = await fetch("/api/admin/room", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
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

  const visible = showHidden ? rows : rows.filter((r) => !r.hidden)

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the room
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">The Waiting Room</h1>
          <p className="text-sm text-gray-500">
            {total.toLocaleString("en-US")} confessions, {hiddenCount.toLocaleString("en-US")} hidden.
            Nothing here is ever deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="rounded-lg border border-gray-800 px-3 py-2 text-xs font-semibold text-gray-300"
        >
          {showHidden ? "Hide the hidden ones" : "Show the hidden ones"}
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to read</CardTitle>
            <CardDescription>Nobody has confessed yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 flex items-start gap-4"
              style={{ opacity: c.hidden ? 0.5 : 1 }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white leading-snug">{c.body}</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  PATIENT #{c.number ?? "0000"} · {new Date(c.createdAt).toLocaleString()} ·{" "}
                  {c.sameCondition.toLocaleString("en-US")} same condition
                  {c.featured ? " · PINNED" : ""}
                  {c.hidden ? " · HIDDEN" : ""}
                </p>
              </div>

              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  title={c.featured ? "Unpin" : "Pin as SEEN BY DR. ONUS"}
                  onClick={() => change(c.id, { featured: !c.featured })}
                  disabled={busy === c.id || c.hidden}
                  className="rounded-lg border border-gray-800 p-2 disabled:opacity-40"
                  style={{ color: c.featured ? "#c6ff2e" : "#9ca3af" }}
                >
                  <Star className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title={c.hidden ? "Put it back in the room" : "Take it out of the room"}
                  onClick={() => change(c.id, { hidden: !c.hidden })}
                  disabled={busy === c.id}
                  className="rounded-lg border border-gray-800 p-2 text-gray-400 disabled:opacity-40"
                >
                  {c.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
