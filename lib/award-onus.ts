import { createAdminClient } from "@/lib/supabase"

export async function awardOnus(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  telegramId: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<boolean> {
  try {
    const { error: txError } = await supabase
      .from("onus_transactions")
      .insert({
        telegram_id: telegramId,
        amount,
        reason,
        reference_id: referenceId || null,
      })

    if (txError) return false

    await supabase.rpc("increment_onus", {
      p_telegram_id: telegramId,
      p_amount: amount,
    })

    return true
  } catch {
    return false
  }
}
