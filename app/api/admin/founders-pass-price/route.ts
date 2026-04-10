import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase"
import { getSession } from "@/lib/auth"

/**
 * Admin API: read/set Founders Pass price in Stars.
 * The price is stored in app_settings under key 'founders_pass_price'
 * as JSON { "amount": <int> }. Read at runtime by the user app invoice route,
 * so changes apply immediately without a deploy.
 */

const MIN_PRICE = 1
const MAX_PRICE = 100000 // 100k Stars hard cap
const DEFAULT_PRICE = 200

async function readPrice(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "founders_pass_price")
    .maybeSingle()

  if (!data?.value) return DEFAULT_PRICE

  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value
    const amount = Number(parsed?.amount)
    if (!Number.isFinite(amount)) return DEFAULT_PRICE
    return Math.floor(amount)
  } catch {
    return DEFAULT_PRICE
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createAdminClient()
    const amount = await readPrice(supabase)

    return NextResponse.json({ amount, minPrice: MIN_PRICE, maxPrice: MAX_PRICE })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const rawAmount = Number(body.amount)

    if (!Number.isFinite(rawAmount)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 })
    }
    const amount = Math.floor(rawAmount)
    if (amount < MIN_PRICE || amount > MAX_PRICE) {
      return NextResponse.json(
        { error: `amount must be between ${MIN_PRICE} and ${MAX_PRICE}` },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "founders_pass_price",
          value: JSON.stringify({ amount }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      amount,
      message: `Founders Pass price updated to ${amount} Stars. Changes apply immediately.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
