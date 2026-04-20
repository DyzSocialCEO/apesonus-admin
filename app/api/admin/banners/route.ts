import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ banners: data || [] })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from("banners")
      .insert({
        message: body.message,
        type: body.type || "promo",
        cta_text: body.cta_text || null,
        cta_link: body.cta_link || null,
        is_active: body.is_active !== false,
        bg_color: body.bg_color || null,
        text_color: body.text_color || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ banner: data })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    const { id } = body as { id?: string | number }
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    // Explicit field allowlist. Columns match the live schema (migration 038).
    const updates: Record<string, any> = {}
    const b = body as Record<string, any>
    if (b.message !== undefined)    updates.message = b.message
    if (b.type !== undefined)       updates.type = b.type
    if (b.cta_text !== undefined)   updates.cta_text = b.cta_text || null
    if (b.cta_link !== undefined)   updates.cta_link = b.cta_link || null
    if (b.is_active !== undefined)  updates.is_active = Boolean(b.is_active)
    if (b.bg_color !== undefined)   updates.bg_color = b.bg_color || null
    if (b.text_color !== undefined) updates.text_color = b.text_color || null

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("banners")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ banner: data })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const supabase = await createAdminClient()
    const { error } = await supabase.from("banners").delete().eq("id", parseInt(id))

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
