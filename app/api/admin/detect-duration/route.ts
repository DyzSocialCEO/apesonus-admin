import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { signBunnyCdnUrl } from "@/lib/bunny-cdn"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { audioUrl } = await request.json()
    if (!audioUrl) return NextResponse.json({ error: "audioUrl required" }, { status: 400 })

    const signedUrl = signBunnyCdnUrl(audioUrl)

    return NextResponse.json({ signedUrl })
  } catch (error) {
    console.error("Error signing URL:", error)
    return NextResponse.json({ error: "Failed to sign URL" }, { status: 500 })
  }
}
