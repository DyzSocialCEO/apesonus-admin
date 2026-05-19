import { signBunnyCdnUrl } from "@/lib/bunny-cdn"

/**
 * Server-side m4a/mp4 duration detection.
 *
 * Runs entirely on the server: it fetches bytes from Bunny (signed)
 * and parses the moov/mvhd atoms. This is reliable for every upload
 * because it does NOT use a browser <audio> element — the browser
 * approach kept failing with SRC_NOT_SUPPORTED on signed CDN URLs.
 *
 * Returns duration in whole seconds, or 0 if it genuinely could not
 * be parsed (with `reason` explaining why, for the admin UI).
 */
export interface DurationResult {
  duration: number
  reason: string
}

export async function detectDurationServer(audioUrl: string): Promise<DurationResult> {
  let signed: string
  try {
    signed = signBunnyCdnUrl(audioUrl)
  } catch (e) {
    return { duration: 0, reason: `sign failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  try {
    // 1. First 64KB — faststart files keep moov at the front.
    let buf = await fetchRange(signed, 0, 65535)
    let dur = parseMoov(buf)
    if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" }

    // 2. Last 128KB — non-faststart files keep moov at the end.
    const head = await fetch(signed, { method: "HEAD" })
    if (!head.ok) {
      return { duration: 0, reason: `CDN HEAD ${head.status} (file missing or token rejected)` }
    }
    const len = parseInt(head.headers.get("content-length") || "0")
    if (len > 65536) {
      buf = await fetchRange(signed, Math.max(0, len - 131072), len - 1)
      dur = parseMoov(buf)
      if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" }
    }

    // 3. Whole file if reasonably small.
    if (len > 0 && len < 25 * 1024 * 1024) {
      const r = await fetch(signed)
      if (!r.ok) return { duration: 0, reason: `CDN GET ${r.status}` }
      buf = new Uint8Array(await r.arrayBuffer())
      dur = parseMoov(buf)
      if (dur !== null && dur > 0) return { duration: Math.round(dur), reason: "" }
    }

    return {
      duration: 0,
      reason: len === 0
        ? "file is 0 bytes / unreachable on CDN"
        : "no moov/mvhd atom found (not a standard m4a, or corrupt upload)",
    }
  } catch (e) {
    return { duration: 0, reason: `fetch/parse error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function fetchRange(url: string, s: number, e: number): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { Range: `bytes=${s}-${e}` } })
  return new Uint8Array(await r.arrayBuffer())
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
    if (sz === 1) {
      if (o + 16 > d.length) break
      o += r32(d, o + 8) * 0x100000000 + r32(d, o + 12)
    } else {
      o += sz
    }
  }
  return -1
}

function r32(d: Uint8Array, o: number): number {
  return ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3]
}
