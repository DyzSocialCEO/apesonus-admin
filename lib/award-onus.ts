import { createAdminClient } from "@/lib/supabase"

const USER_POOL_CAP = 8_000_000_000 // 8B max distributed to users

/**
 * Award $ONUS to a user — inserts onus_transaction AND atomically updates users.total_onus.
 * Enforces the 8B user pool supply cap.
 * Use this everywhere instead of raw onus_transactions insert.
 */
export async function awardOnus(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  telegramId: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<boolean> {
  try {
    if (amount <= 0) return false

    // Round to integer — DB column is integer
    const roundedAmount = Math.round(amount)
    if (roundedAmount <= 0) return false

    // Check supply cap — sum of all user balances
    // This is fast because users table is small compared to transactions
    const { data: sumData } = await supabase
      .from("users")
      .select("total_onus")

    let totalDistributed = 0
    if (sumData) {
      for (const u of sumData) {
        totalDistributed += (u.total_onus || 0)
      }
    }

    if (totalDistributed >= USER_POOL_CAP) {
      console.log(`ONUS cap reached: ${totalDistributed} / ${USER_POOL_CAP}. Skipping award.`)
      return false
    }

    // If awarding would exceed cap, award only what's remaining
    const remaining = USER_POOL_CAP - totalDistributed
    const actualAmount = Math.min(roundedAmount, remaining)

    if (actualAmount <= 0) return false

    // 1. Insert transaction record
    const { error: txError } = await supabase
      .from("onus_transactions")
      .insert({
        telegram_id: telegramId,
        amount: actualAmount,
        reason,
        reference_id: referenceId || null,
      })

    if (txError) return false

    // 2. Atomically increment user's total_onus balance
    await supabase.rpc("increment_onus", {
      p_telegram_id: telegramId,
      p_amount: actualAmount,
    })

    return true
  } catch {
    return false
  }
}
