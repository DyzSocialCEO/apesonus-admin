import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { signBunnyCdnUrl } from "@/lib/bunny-cdn"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { url } = await request.json()
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 })
    }

    const signedUrl = signBunnyCdnUrl(url)
    return NextResponse.json({ signedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to sign" }, { status: 500 })
  }
}
