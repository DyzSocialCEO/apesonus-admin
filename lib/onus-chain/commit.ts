/**
 * lib/onus-chain/commit.ts — Layer 2: hash commitment to Solana.
 *
 * Canonicalizes a dataset (sorted keys → reproducible), SHA-256 hashes it, and
 * posts the hash to the SPL Memo program. Anyone can re-hash the published
 * dataset and match it against the on-chain memo → proof of non-tampering.
 *
 * IMPORTANT: this does NOT use sendAndConfirmTransaction. That helper opens a
 * websocket (signatureSubscribe) to await confirmation, which on Railway's
 * serverless runtime fails and retries in a tight loop ("t.mask is not a
 * function"), spamming logs until the process OOM-crashes. Instead we send the
 * raw transaction over HTTP and poll getSignatureStatuses. No websocket.
 *
 * BEST-EFFORT: any failure returns null + logs once; never blocks settlement.
 *
 * Env: ONUS_COMMIT_SECRET (JSON byte array OR base58 string), ONUS_RPC_URL (defaults to devnet)
 */

import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from "@solana/web3.js"
import { createHash } from "node:crypto"
import bs58 from "bs58"

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

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

export function hashDataset(dataset: unknown): { canonical: string; hash: string } {
  const c = canonical(dataset)
  return { canonical: c, hash: sha256Hex(c) }
}

function loadKeypair(): Keypair | null {
  const raw = process.env.ONUS_COMMIT_SECRET?.trim()
  if (!raw) return null
  try {
    // Accept either format so the paste "just works":
    //   1. JSON byte array  e.g. [12,45,...] (solana-keygen output)
    //   2. base58 string    (Phantom "export private key")
    if (raw.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
    }
    return Keypair.fromSecretKey(bs58.decode(raw))
  } catch (e) {
    console.error("[onus-commit] bad ONUS_COMMIT_SECRET:", (e as Error).message)
    return null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Hash the dataset and post it to the Memo program over HTTP (no websocket).
 * Returns { hash, signature } once the tx is confirmed, or null on failure.
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
    // disableRetryOnRateLimit avoids internal retry storms; no ws used here.
    const conn = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true })

    const memo = `APESONUS:commit:${label}:${hash}`
    const ix = new TransactionInstruction({
      keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    })

    const tx = new Transaction().add(ix)
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = kp.publicKey
    tx.sign(kp)

    // Send raw, then poll status over HTTP. No signatureSubscribe / websocket.
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })

    // Poll up to ~30s for confirmation.
    for (let i = 0; i < 30; i++) {
      const { value } = await conn.getSignatureStatuses([sig])
      const st = value[0]
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
        if (st.err) {
          console.error("[onus-commit] tx landed with error:", JSON.stringify(st.err))
          return null
        }
        return { hash, signature: sig }
      }
      await sleep(1000)
    }
    // Not confirmed in time — return the sig anyway; it likely lands.
    console.warn("[onus-commit] not confirmed in 30s, returning sig optimistically:", sig)
    return { hash, signature: sig }
  } catch (e) {
    console.error("[onus-commit] on-chain commit failed:", (e as Error).message)
    return null
  }
}
