import { signBunnyCdnUrl } from "@/lib/bunny-cdn"

/**
 * Server-side m4a/mp4 duration detection.
 *
 * Parses moov/mvhd atoms from bytes fetched off Bunny (signed). No browser
 * <audio> element, and — critically — no HEAD request (Bunny's token zone
 * 403s server-side HEAD; GET, the same verb the PWA uses for playback, works).
 *
 * Referrer: Bunny hotlink protection checks the Referer header. Browser
 * playback passes because the browser sends the app's origin (which is on the
 * allowlist). A server fetch has to send an allowed Referer itself — so the
 * routes pass the ADMIN's own origin (the URL added to the Bunny allowlist),
 * and if that's still blocked we retry with NO Referer (covers zones that
 * allow empty-referrer / direct access). Override with DURATION_FETCH_REFERER.
 *
 * Returns duration in whole seconds, or 0 (with `reason`) if it truly couldn't.
 */
export interface DurationResult {
  duration: number
  reason: string
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// Build a request header set. Includes Referer only when one is supplied.
function headersFor(referer?: string): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": UA, "Accept": "audio/mp4,audio/*;q=0.9,*/*;q=0.5" }
  if (referer) h["Referer"] = referer
  return h
}

// Derive the caller's own origin from the incoming request — this is the admin
// URL the browser is on (and that you'd add to Bunny's allowed referrers).
export function refererFromRequest(request: Request): string | undefined {
  const origin = request.headers.get("origin")
  if (origin) return origin
  const host = request.headers.get("host")
  if (host) return `${request.headers.get("x-forwarded-proto") || "https"}://${host}`
  return undefined
}

interface RangeResult { ok: boolean; status: number; total: number; bytes: Uint8Array }

async function getRange(url: string, s: number, e: number, headers: Record<string, string>): Promise<RangeResult> {
  const r = await fetch(url, { headers: { ...headers, Range: `bytes=${s}-${e}` } })
  let total = 0
  const cr = r.headers.get("content-range")
  if (cr) { const slash = cr.lastIndexOf("/"); if (slash !== -1) { const t = parseInt(cr.slice(slash + 1), 10); if (Number.isFinite(t)) total = t } }
  if (!total) { const cl = parseInt(r.headers.get("content-length") || "0", 10); if (Number.isFinite(cl)) total = cl }
  const okBody = r.ok || r.status === 206 || r.status === 200
  const bytes = okBody ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array(0)
  return { ok: okBody, status: r.status, total, bytes }
}

export async function detectDurationServer(audioUrl: string, referer?: string): Promise<DurationResult> {
  let signed: string
  try {
    signed = signBunnyCdnUrl(audioUrl)
  } catch (e) {
    return { duration: 0, reason: `sign failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Referer candidates, tried in order until one returns 2xx: the admin origin
  // (allowlisted) → DURATION_FETCH_REFERER → MAIN_APP_URL → finally NO referer.
  const candidates: Array<string | undefined> = []
  const addRef = (v?: string | null) => { if (v && !candidates.includes(v)) candidates.push(v) }
  addRef(referer)
  addRef(process.env.DURATION_FETCH_REFERER)
  addRef(process.env.MAIN_APP_URL)
  candidates.push(undefined)

  try {
    let headers: Record<string, string> | null = null
    let first: RangeResult | null = null
    for (const ref of candidates) {
      const h = headersFor(ref)
      const probe = await getRange(signed, 0, 65535, h)
      first = probe
      if (probe.ok) { headers = h; break }
    }
    if (!headers || !first || !first.ok) {
      return { duration: 0, reason: `CDN GET ${first?.status ?? "?"} (token rejected or referrer blocked by Bunny)` }
    }

    // 1. moov in the first 64KB (faststart).
    let dur = parseMoov(first.bytes)
    if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" }

    const len = first.total
    // 2. moov at the end (non-faststart).
    if (len > 65536) {
      const tail = await getRange(signed, Math.max(0, len - 131072), len - 1, headers)
      if (tail.ok) { dur = parseMoov(tail.bytes); if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" } }
    }
    // 3. whole file if small.
    if (len > 0 && len < 25 * 1024 * 1024) {
      const whole = await getRange(signed, 0, len - 1, headers)
      if (whole.ok) { dur = parseMoov(whole.bytes); if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" } }
    }

    return {
      duration: 0,
      reason: len === 0 ? "file is 0 bytes / unreachable on CDN"
        : "no moov/mvhd atom found (not a standard m4a, or corrupt upload)",
    }
  } catch (e) {
    return { duration: 0, reason: `fetch/parse error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

function parseMoov(d: Uint8Array): number | null {
  const moov = findAtom(d, "moov", 0)
  if (moov === -1) return null
  const mvhd = findAtom(d, "mvhd", moov + 8)
  if (mvhd === -1) return null
  const h = mvhd + 8
  if (h + 4 > d.length) return null
  const v = d[h]
  if (v === 0) {
    const o = h + 4
    if (o + 16 > d.length) return null
    const ts = r32(d, o + 8), du = r32(d, o + 12)
    return ts ? du / ts : null
  }
  if (v === 1) {
    const o = h + 4
    if (o + 28 > d.length) return null
    const ts = r32(d, o + 16)
    const du = r32(d, o + 20) * 0x100000000 + r32(d, o + 24)
    return ts ? du / ts : null
  }
  return null
}

function findAtom(d: Uint8Array, n: string, s: number): number {
  let o = s
  const c = [n.charCodeAt(0), n.charCodeAt(1), n.charCodeAt(2), n.charCodeAt(3)]
  while (o + 8 <= d.length) {
    const sz = r32(d, o)
    if (d[o + 4] === c[0] && d[o + 5] === c[1] && d[o + 6] === c[2] && d[o + 7] === c[3]) return o
    if (sz === 0) break
    if (sz === 1) { if (o + 16 > d.length) break; o += r32(d, o + 8) * 0x100000000 + r32(d, o + 12) }
    else o += sz
  }
  return -1
}

function r32(d: Uint8Array, o: number): number {
  return ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3]
}
