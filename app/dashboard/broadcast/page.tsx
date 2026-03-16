"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Send, Loader2, AlertTriangle, CheckCircle, Users, Shield } from "lucide-react"

export default function BroadcastPage() {
  const [message, setMessage] = useState("")
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<{ targetCount: number } | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number; blocked: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    if (!message.trim()) return
    setPreviewing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), verifiedOnly, preview: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setPreviewData(data)
      } else {
        setError(data.error || "Preview failed")
      }
    } catch {
      setError("Network error")
    }
    setPreviewing(false)
  }

  const handleSend = async () => {
    if (!message.trim()) return
    if (!confirm(`Send this message to ${previewData?.targetCount || "all"} users? This cannot be undone.`)) return

    setSending(true)
    setError(null)
    setResult(null)
    setPreviewData(null)
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), verifiedOnly }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResult(data)
        setMessage("")
      } else {
        setError(data.error || "Broadcast failed")
      }
    } catch {
      setError("Network error")
    }
    setSending(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Broadcast</h1>
        <p className="text-gray-400">Send a message to all users via the Telegram bot</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Compose Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); setPreviewData(null) }}
            placeholder="Type your message... (supports HTML: <b>bold</b>, <i>italic</i>, <a href='...'>links</a>)"
            rows={5}
            maxLength={4000}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{message.length} / 4000</span>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => { setVerifiedOnly(e.target.checked); setPreviewData(null) }}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
              />
              <Shield className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-300">Verified users only</span>
            </label>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-yellow-400 font-medium">Messages are sent directly to users via Telegram</p>
              <p className="text-xs text-yellow-400/60 mt-0.5">Rate limited at 25/sec. Large broadcasts may take time. Cannot be undone.</p>
            </div>
          </div>

          {/* Preview result */}
          {previewData && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Users className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-purple-400 font-medium">
                  Will send to {previewData.targetCount.toLocaleString()} user{previewData.targetCount !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-purple-400/60 mt-0.5">
                  Estimated time: ~{Math.ceil(previewData.targetCount / 25)} seconds
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400 font-medium">Broadcast complete</span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-1">
                <div>
                  <p className="text-lg font-bold text-white">{result.sent}</p>
                  <p className="text-xs text-gray-500">Delivered</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{result.failed}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-yellow-400">{result.blocked}</p>
                  <p className="text-xs text-gray-500">Blocked bot</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handlePreview}
              disabled={!message.trim() || previewing || sending}
              className="flex-1 py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-40"
            >
              {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Preview
            </button>
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending || !previewData}
              className="flex-1 py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : "Send Broadcast"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-sm text-gray-400">Message Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-500">Supports HTML formatting:</p>
          <div className="space-y-1 text-xs text-gray-500 font-mono bg-gray-800 rounded-lg p-3">
            <p>&lt;b&gt;bold text&lt;/b&gt;</p>
            <p>&lt;i&gt;italic text&lt;/i&gt;</p>
            <p>&lt;a href="https://..."&gt;link text&lt;/a&gt;</p>
            <p>&lt;code&gt;inline code&lt;/code&gt;</p>
          </div>
          <p className="text-xs text-gray-500 pt-2">Emojis work: 🐒 🎵 ⚔️ 🔥 💎</p>
        </CardContent>
      </Card>
    </div>
  )
}
