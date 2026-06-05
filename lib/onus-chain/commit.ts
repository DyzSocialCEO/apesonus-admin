/**
 * lib/onus-chain/commit.ts — Layer 2: hash commitment to Solana.
 *
 * Takes the exact dataset that decided a market, canonicalizes it (sorted keys
 * → reproducible), SHA-256 hashes it, and posts the hash to the SPL Memo program.
 * Anyone can later re-hash the published dataset and match it against the on-chain
 * memo → proof we did not alter the numbers after the fact.
 *
 * BEST-EFFORT: if the key/RPC is missing or the chain call fails, this returns
 * null and logs — it must NEVER block a settlement/payout. The economy keeps
 * working; the proof is an addition, not a dependency.
 *
 * Env:
 *   ONUS_COMMIT_SECRET  JSON byte-array of the server keypair (devnet throwaway)
 *   ONUS_RPC_URL        defaults to devnet
 */

import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js"
import { createHash } from "node:crypto"

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

/** Stable, sorted-key serialization so the hash is reproducible by anyone. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]"
  if (v && typeof v === "object") {
    return "{" + Object.keys(v as Record<string, unknown>).sort()
      .map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k]))
      .join(",") + "}"
  }
  return JSON.stringify(v)
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

/** Hash any dataset and return its canonical form + hash (no chain call). */
export function hashDataset(dataset: unknown): { canonical: string; hash: string } {
  const c = canonical(dataset)
  return { canonical: c, hash: sha256Hex(c) }
}

function loadKeypair(): Keypair | null {
  const raw = process.env.ONUS_COMMIT_SECRET
  if (!raw) return null
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  } catch (e) {
    console.error("[onus-commit] bad ONUS_COMMIT_SECRET:", (e as Error).message)
    return null
  }
}

/**
 * Hash the dataset and post it to the Memo program.
 * Returns { hash, signature } on success, or null (logged) on any failure.
 */
export async function commitHash(
  label: string,
  dataset: unknown,
): Promise<{ hash: string; signature: string } | null> {
  const { hash } = hashDataset(dataset)
  const kp = loadKeypair()
  if (!kp) {
    console.warn("[onus-commit] no ONUS_COMMIT_SECRET — skipping on-chain commit")
    return null
  }
  try {
    const rpc = process.env.ONUS_RPC_URL || "https://api.devnet.solana.com"
    const conn = new Connection(rpc, "confirmed")
    const memo = `APESONUS:commit:${label}:${hash}`
    const ix = new TransactionInstruction({
      keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    })
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [kp])
    return { hash, signature: sig }
  } catch (e) {
    console.error("[onus-commit] on-chain commit failed:", (e as Error).message)
    return null
  }
}
