"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, Loader2, RefreshCw, Trash2, AlertCircle, AlertTriangle, Info,
  ChevronDown, ChevronRight, Copy, Check, Filter,
} from "lucide-react"

interface ErrorLog {
  id: string
  created_at: string
  source: string
  severity: "error" | "warn" | "info"
  message: string
  stack: string | null
  component_stack: string | null
  url: string | null
  user_agent: string | null
  telegram_id: number | null
  extra: Record<string, unknown> | null
}

interface LogsResponse {
  logs: ErrorLog[]
  counts: {
    total24h: number
    bySource: Record<string, number>
    bySeverity: Record<string, number>
  }
}

const SOURCES = [
  { value: "",                     label: "All sources"       },
  { value: "window_error",         label: "Window error"      },
  { value: "unhandled_rejection",  label: "Unhandled promise" },
  { value: "error_boundary",       label: "React boundary"    },
  { value: "mini_player",          label: "Mini player"       },
  { value: "app_content",          label: "App content"       },
  { value: "audio_provider",       label: "Audio provider"    },
  { value: "payment",              label: "Payment"           },
  { value: "api",                  label: "API"               },
  { value: "other",                label: "Other"             },
]

const SEVERITIES = [
  { value: "",      label: "All severities" },
  { value: "error", label: "Error"          },
  { value: "warn",  label: "Warning"        },
  { value: "info",  label: "Info"           },
]

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const sec = Math.floor(diff / 1000)
  if (sec < 60)    return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60)    return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)     return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7)     return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

function severityBadge(severity: string) {
  const map: Record<string, { cls: string; icon: any }> = {
    error: { cls: "bg-red-500/15 text-red-400 border-red-500/30",       icon: AlertCircle   },
    warn:  { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
    info:  { cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",    icon: Info          },
  }
  const cfg = map[severity] || map.error
  const Icon = cfg.icon
  return (
    <Badge className={`${cfg.cls} border text-[10px] gap-1`}>
      <Icon className="w-3 h-3" />
      {severity.toUpperCase()}
    </Badge>
  )
}

function sourceBadge(source: string) {
  const colors: Record<string, string> = {
    window_error:        "bg-red-500/10 text-red-300",
    unhandled_rejection: "bg-orange-500/10 text-orange-300",
    error_boundary:      "bg-pink-500/10 text-pink-300",
    mini_player:         "bg-purple-500/10 text-purple-300",
    app_content:         "bg-blue-500/10 text-blue-300",
    audio_provider:      "bg-cyan-500/10 text-cyan-300",
    payment:             "bg-green-500/10 text-green-300",
    api:                 "bg-yellow-500/10 text-yellow-300",
    other:               "bg-gray-500/10 text-gray-300",
  }
  return (
    <Badge className={`${colors[source] || colors.other} border-0 text-[10px] font-mono`}>
      {source}
    </Badge>
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [counts, setCounts] = useState<LogsResponse["counts"]>({ total24h: 0, bySource: {}, bySeverity: {} })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  const [filterSource, setFilterSource] = useState("")
  const [filterSeverity, setFilterSeverity] = useState("")
  const [filterQuery, setFilterQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Debounce the search box so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(filterQuery), 300)
    return () => clearTimeout(t)
  }, [filterQuery])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSource)   params.set("source", filterSource)
      if (filterSeverity) params.set("severity", filterSeverity)
      if (debouncedQuery) params.set("q", debouncedQuery)
      params.set("limit", "100")

      const res = await fetch(`/api/admin/logs?${params.toString()}`)
      const data: LogsResponse = await res.json()
      setLogs(data.logs || [])
      setCounts(data.counts || { total24h: 0, bySource: {}, bySeverity: {} })
    } catch {
      setMsg("Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [filterSource, filterSeverity, debouncedQuery])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Auto-refresh every 30s so the page feels live without being chatty
  useEffect(() => {
    const t = setInterval(() => { fetchLogs() }, 30_000)
    return () => clearInterval(t)
  }, [fetchLogs])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setMsg("Copy failed")
    }
  }

  const deleteOne = async (id: string) => {
    if (!confirm("Delete this log entry?")) return
    setMsg("")
    try {
      const res = await fetch(`/api/admin/logs?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setLogs(prev => prev.filter(l => l.id !== id))
        setMsg("Deleted")
      } else {
        setMsg(`Error: ${data.error || "Delete failed"}`)
      }
    } catch {
      setMsg("Delete failed")
    }
  }

  const pruneOld = async () => {
    if (!confirm("Delete all logs older than 30 days?")) return
    setMsg("")
    try {
      const res = await fetch("/api/admin/logs?olderThanDays=30", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setMsg(`Pruned ${data.deleted} old entries`)
        await fetchLogs()
      } else {
        setMsg(`Error: ${data.error || "Prune failed"}`)
      }
    } catch {
      setMsg("Prune failed")
    }
  }

  const wipeAll = async () => {
    if (!confirm("WIPE ALL LOGS? This cannot be undone.")) return
    if (!confirm("Really wipe every log entry? Last chance.")) return
    setMsg("")
    try {
      const res = await fetch("/api/admin/logs?all=1", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setMsg(`Wiped ${data.deleted} entries`)
        await fetchLogs()
      } else {
        setMsg(`Error: ${data.error || "Wipe failed"}`)
      }
    } catch {
      setMsg("Wipe failed")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Error Logs</h1>
          <p className="text-gray-400">
            {counts.total24h} errors in last 24h · {logs.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={pruneOld}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20"
            title="Delete logs older than 30 days"
          >
            Prune 30d+
          </button>
          <button
            onClick={wipeAll}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
            title="Wipe all logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith("Error") || msg.includes("failed") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {msg}
        </div>
      )}

      {/* 24h summary strip */}
      {counts.total24h > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 mr-2">Last 24h:</span>
              {Object.entries(counts.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <button
                    key={source}
                    onClick={() => setFilterSource(source === filterSource ? "" : source)}
                    className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                      filterSource === source
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    {source} <span className="opacity-60">{count}</span>
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Filter className="w-3 h-3" />
            Filters
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search message..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:border-primary"
            >
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:border-primary"
            >
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Log list */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-gray-400 font-medium">No errors match your filters</p>
              <p className="text-gray-600 text-sm mt-1">
                {filterSource || filterSeverity || debouncedQuery
                  ? "Try clearing the filters"
                  : "Everything's running clean"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {logs.map((log) => {
                const isOpen = expanded.has(log.id)
                const hasDetails = !!(log.stack || log.component_stack || log.url || log.user_agent || log.extra)
                return (
                  <div key={log.id} className="hover:bg-gray-800/30 transition-colors">
                    <button
                      onClick={() => hasDetails && toggleExpanded(log.id)}
                      className="w-full text-left px-4 py-3 flex items-start gap-3"
                      disabled={!hasDetails}
                    >
                      <div className="pt-0.5 text-gray-600">
                        {hasDetails ? (
                          isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                        ) : <span className="inline-block w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {severityBadge(log.severity)}
                          {sourceBadge(log.source)}
                          <span className="text-xs text-gray-500">{formatRelativeTime(log.created_at)}</span>
                          {log.telegram_id && (
                            <span className="text-xs text-gray-600 font-mono">tg:{log.telegram_id}</span>
                          )}
                        </div>
                        <p className="text-sm text-white font-mono break-words">
                          {log.message}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOne(log.id) }}
                        className="p-1.5 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 shrink-0"
                        title="Delete this entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>

                    {isOpen && hasDetails && (
                      <div className="px-4 pb-4 pl-11 space-y-3">
                        {log.stack && (
                          <DetailBlock
                            label="Stack trace"
                            content={log.stack}
                            copyId={`stack-${log.id}`}
                            copied={copied === `stack-${log.id}`}
                            onCopy={copyToClipboard}
                          />
                        )}
                        {log.component_stack && (
                          <DetailBlock
                            label="Component stack"
                            content={log.component_stack}
                            copyId={`comp-${log.id}`}
                            copied={copied === `comp-${log.id}`}
                            onCopy={copyToClipboard}
                          />
                        )}
                        {log.url && (
                          <div className="text-xs">
                            <span className="text-gray-500">URL: </span>
                            <span className="text-gray-300 font-mono break-all">{log.url}</span>
                          </div>
                        )}
                        {log.user_agent && (
                          <div className="text-xs">
                            <span className="text-gray-500">User agent: </span>
                            <span className="text-gray-300 font-mono break-all">{log.user_agent}</span>
                          </div>
                        )}
                        {log.extra && Object.keys(log.extra).length > 0 && (
                          <DetailBlock
                            label="Extra"
                            content={JSON.stringify(log.extra, null, 2)}
                            copyId={`extra-${log.id}`}
                            copied={copied === `extra-${log.id}`}
                            onCopy={copyToClipboard}
                          />
                        )}
                        <div className="text-[10px] text-gray-600 font-mono">
                          {new Date(log.created_at).toLocaleString()} · id: {log.id}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DetailBlock({
  label, content, copyId, copied, onCopy,
}: {
  label: string
  content: string
  copyId: string
  copied: boolean
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <button
          onClick={() => onCopy(content, copyId)}
          className="text-xs text-gray-500 hover:text-primary flex items-center gap-1"
        >
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="text-[11px] text-gray-400 bg-black/40 border border-gray-800 rounded p-2 overflow-x-auto max-h-48 font-mono whitespace-pre-wrap break-all">
        {content}
      </pre>
    </div>
  )
}
