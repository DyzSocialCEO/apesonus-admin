import crypto from "crypto"

export function signBunnyCdnUrl(url: string): string {
  const tokenKey = process.env.BUNNY_TOKEN_KEY
  if (!tokenKey) {
    throw new Error("BUNNY_TOKEN_KEY is not configured — cannot serve unsigned CDN URLs")
  }

  const urlObj = new URL(url)
  const path = urlObj.pathname

  const now = Math.floor(Date.now() / 1000)
  const roundedNow = Math.floor(now / 600) * 600
  const expires = roundedNow + 7200

  const hashString = `${tokenKey}${path}${expires}`
  const hash = crypto.createHash("sha256").update(hashString).digest()
  const token = hash
    .toString("base64")
    .replace(/\n/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")

  return `${url}?token=${token}&expires=${expires}`
}
