/** Capture a public Solana blockhash as the provably-fair draw seed (raw JSON-RPC). */
export async function captureDrawSeed(): Promise<{ seed: string; slot: number } | null> {
  const rpc = process.env.ONUS_RPC_URL || "https://api.devnet.solana.com"
  try {
    const r = await fetch(rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "finalized" }] }),
    })
    const j = await r.json()
    const seed = j?.result?.value?.blockhash, slot = j?.result?.context?.slot
    if (seed && typeof seed === "string") return { seed, slot: Number(slot) || 0 }
  } catch (e) { console.error("[draw-seed]", (e as Error).message) }
  return null
}
