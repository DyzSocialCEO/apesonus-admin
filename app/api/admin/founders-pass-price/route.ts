import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * DEPRECATED - Founders Pass mechanic removed on launch pivot.
 *
 * The app no longer sells a Founders Pass for Stars. The Genesis Badge
 * is now earned by collecting 10,000 $ONUS during the launch window.
 * See /api/admin/genesis-config for the new threshold/maxHolders controls
 * and /api/admin/genesis-window for window start/close.
 *
 * This stub returns 410 Gone so any lingering caller gets a clear
 * signal instead of a silent 404 or a stale price.
 */

const DEPRECATION_MESSAGE = {
  error: "Gone",
  reason: "Founders Pass was removed. Use /api/admin/genesis-config for threshold/maxHolders or /api/admin/genesis-window for window controls.",
}

export async function GET() {
  return NextResponse.json(DEPRECATION_MESSAGE, { status: 410 })
}

export async function PATCH() {
  return NextResponse.json(DEPRECATION_MESSAGE, { status: 410 })
}

export async function POST() {
  return NextResponse.json(DEPRECATION_MESSAGE, { status: 410 })
}
