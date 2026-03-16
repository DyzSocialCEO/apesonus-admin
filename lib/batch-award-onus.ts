import { createAdminClient } from "@/lib/supabase"

const USER_POOL_CAP = 8_000_000_000 // 8B max distributed to users

interface AwardEntry {
  telegramId: string
  amount: number
  reason: string
  referenceId?: string
}

/**
 * Batch-award $ONUS to multiple users.
 * Checks the 8B supply cap ONCE (not per user), then bulk-inserts
 * all transaction records and loops balance increments.
 */
export async function batchAwardOnus(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  entries: AwardEntry[]
): Promise<{ awarded: number; totalOnus: number; results: Array<{ telegramId: string; amount: number }> }> {
  if (entries.length === 0) return { awarded: 0, totalOnus: 0, results: [] }

  try {
    // ── 1. Check supply cap ONCE ──
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
      return { awarded: 0, totalOnus: 0, results: [] }
    }

    const remaining = USER_POOL_CAP - totalDistributed

    // ── 2. Calculate all rewards, respecting cap ──
    const validEntries: Array<{ telegramId: string; amount: number; reason: string; referenceId: string | null }> = []
    let runningTotal = 0

    for (const entry of entries) {
      const rounded = Math.round(entry.amount)
      if (rounded <= 0) continue

      const capped = Math.min(rounded, remaining - runningTotal)
      if (capped <= 0) break

      validEntries.push({
        telegramId: entry.telegramId,
        amount: capped,
        reason: entry.reason,
        referenceId: entry.referenceId || null,
      })
      runningTotal += capped
    }

    if (validEntries.length === 0) return { awarded: 0, totalOnus: 0, results: [] }

    // ── 3. Bulk insert all transaction records ──
    const txRows = validEntries.map(e => ({
      telegram_id: e.telegramId,
      amount: e.amount,
      reason: e.reason,
      reference_id: e.referenceId,
    }))

    const { error: txError } = await supabase
      .from("onus_transactions")
      .insert(txRows)

    if (txError) {
      for (const row of txRows) {
        await supabase.from("onus_transactions").insert(row)
      }
    }

    // ── 4. Increment each user's balance ──
    for (const entry of validEntries) {
      await supabase.rpc("increment_onus", {
        p_telegram_id: entry.telegramId,
        p_amount: entry.amount,
      })
    }

    return {
      awarded: validEntries.length,
      totalOnus: runningTotal,
      results: validEntries.map(e => ({ telegramId: e.telegramId, amount: e.amount })),
    }
  } catch {
    return { awarded: 0, totalOnus: 0, results: [] }
  }
}
