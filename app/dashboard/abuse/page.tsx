"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, ShieldAlert, Undo2 } from "lucide-react"

/**
 * /dashboard/abuse
 *
 * WHO LOOKS LIKE WHO.
 *
 * Two lists. Machines carrying more than one patient file, and networks doing
 * the same. Neither is proof: a family shares a laptop, an office shares an
 * address, a phone provider shares one with a city. This is a place to look
 * before there is money on the table, not a verdict.
 *
 * Everything here is reversible. Voiding leaves the Doses in place and stops
 * them counting, so the public listening history keeps telling the truth about
 * what happened, and putting them back is one press.
 */

interface Cluster {
  key: string
  accounts: number
  lastSeen: string
  users: string[]
}

interface Person {
  id: string
  email: string | null
  display_name: string | null
}

interface Flag {
  user_id: string
  status: string
  note: string
}

export default function AbusePage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [devices, setDevices] = useState<Cluster[]>([])
  const [networks, setNetworks] = useState<Cluster[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [said, setSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/abuse", { cache: "no-store" })
      const d = await r.json().catch(() => null)
      setDevices(d?.clusters?.devices ?? [])
      setNetworks(d?.clusters?.networks ?? [])
      setPeople(d?.people ?? [])
      setFlags(d?.flags ?? [])
    } catch {
      setSaid("Could not read the clusters.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id)
    return p?.email || p?.display_name || `${id.slice(0, 8)}…`
  }
  const flagOf = (id: string) => flags.find((f) => f.user_id === id)?.status || "ok"

  const act = async (what: string, user: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${what}-${user}`)
    setSaid(null)
    try {
      const r = await fetch("/api/admin/abuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what, user, note, reason: note, ...extra }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) {
        setSaid(d?.error || "That did not go through.")
      } else if (what === "void") {
        setSaid(`Stopped ${d?.voided ?? 0} doses from counting.`)
      } else if (what === "restore") {
        setSaid(`Put ${d?.restored ?? 0} doses back.`)
      } else {
        setSaid(`Marked as ${d?.status}.`)
      }
      await load()
    } catch {
      setSaid("That did not go through.")
    } finally {
      setBusy(null)
    }
  }

  const List = ({ title, blurb, rows }: { title: string; blurb: string; rows: Cluster[] }) => (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">{title}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing here. Every patient looks like one person.</p>
        ) : (
          rows.map((c) => (
            <div key={c.key} className="rounded-lg border border-gray-800 p-3">
              <div className="flex items-center justify-between">
                <code className="text-xs text-gray-500">{c.key.slice(0, 20)}…</code>
                <span className="text-xs text-yellow-400">{c.accounts} patient files</span>
              </div>
              <div className="mt-3 space-y-2">
                {c.users.map((u) => (
                  <div key={u} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-white">{nameOf(u)}</span>
                    <span
                      className={
                        flagOf(u) === "suspended"
                          ? "text-[11px] text-red-400"
                          : flagOf(u) === "watch"
                            ? "text-[11px] text-yellow-400"
                            : "text-[11px] text-gray-600"
                      }
                    >
                      {flagOf(u)}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => act("flag", u, { status: "watch" })}>
                        Watch
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => act("flag", u, { status: "suspended" })}>
                        Suspend
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => act("void", u)}>
                        Void doses
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => act("flag", u, { status: "ok" })}>
                        <Undo2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-yellow-400" />
            Who looks like who
          </h1>
          <p className="text-gray-400">
            Machines and networks carrying more than one patient file. Not proof of anything on its
            own, and everything here can be undone.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4 space-y-2">
          <label className="block text-xs font-medium text-gray-400">
            Why (saved with the flag, and with the void)
          </label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Six files on one machine, all dosing the same track"
          />
          {said ? <p className="text-sm text-yellow-400">{said}</p> : null}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      ) : (
        <>
          <List
            title="One machine, several files"
            blurb="The strongest of the two. A shared laptop looks like this, and so does a farm."
            rows={devices}
          />
          <List
            title="One network, several files"
            blurb="Weaker. An office, a campus or a phone provider all share an address."
            rows={networks}
          />
        </>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4 text-sm text-gray-500 space-y-1">
          <p>
            <b className="text-gray-300">Watch</b> changes nothing. It is a note to look again later.
          </p>
          <p>
            <b className="text-gray-300">Suspend</b> lets them keep listening while nothing they do
            reaches the counters. They are not told, because telling somebody exactly when they were
            caught teaches them how to avoid it next time.
          </p>
          <p>
            <b className="text-gray-300">Void doses</b> leaves every Dose in place and stops them
            counting toward anything that pays. The Chart and the listening history stay honest.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
