import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"
import bs58 from "bs58"

/**
 * USDC payout sender. Every network call is time-boxed, so nothing can hang;
 * a stalled RPC fails fast with a labelled error instead of freezing. The
 * caller records the signature the moment submit returns, before confirmation,
 * so a successful broadcast is never lost.
 *
 * PAYOUT_WALLET_SECRET: base58 secret key (Phantom export) or JSON byte array.
 * Fund the wallet with USDC plus a little SOL for fees and one-time rent.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
const USDC_DECIMALS = 6
const LOOKUP_MS = 10000
const SUBMIT_MS = 20000
const CONFIRM_MS = 12000

function rpcUrl(): string {
  return process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
}

function loadPayer(): Keypair {
  const raw = (process.env.PAYOUT_WALLET_SECRET || "").trim()
  if (!raw) throw new Error("PAYOUT_WALLET_SECRET not set")
  if (raw.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  return Keypair.fromSecretKey(bs58.decode(raw))
}

export function payoutWalletAddress(): string | null {
  try { return loadPayer().publicKey.toBase58() } catch { return null }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)),
  ])
}

export type SubmitResult = { signature: string; from: string }

/** Submit only. Returns as soon as the transfer is broadcast. Throws (with a
 *  clear reason) if any step fails or stalls. Does NOT wait for confirmation. */
export async function sendUsdc(toOwner: string, amountUsdc: number): Promise<SubmitResult> {
  if (!(amountUsdc > 0)) throw new Error("amount must be positive")
  const connection = new Connection(rpcUrl(), { commitment: "confirmed", confirmTransactionInitialTimeout: 20000 })
  const payer = loadPayer()
  const dest = new PublicKey(toOwner) // throws on an invalid address

  const fromAta = await getAssociatedTokenAddress(USDC_MINT, payer.publicKey)
  const toAta = await getAssociatedTokenAddress(USDC_MINT, dest)
  const amountBase = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS))

  const tx = new Transaction()
  const toInfo = await withTimeout(connection.getAccountInfo(toAta), LOOKUP_MS, "account lookup")
  if (!toInfo) tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, dest, USDC_MINT))
  tx.add(createTransferCheckedInstruction(fromAta, USDC_MINT, toAta, payer.publicKey, amountBase, USDC_DECIMALS))

  const { blockhash } = await withTimeout(connection.getLatestBlockhash("confirmed"), LOOKUP_MS, "blockhash fetch")
  tx.recentBlockhash = blockhash
  tx.feePayer = payer.publicKey
  tx.sign(payer)

  const signature = await withTimeout(
    connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }),
    SUBMIT_MS, "transaction submit",
  )
  return { signature, from: payer.publicKey.toBase58() }
}

/** Best-effort confirmation. Never throws; returns false if unknown/slow. The
 *  signature is already persisted by the caller, so this only refines the note. */
export async function sendSplToken(
  mintAddress: string, decimals: number, toOwner: string, amountTokens: number
): Promise<SubmitResult> {
  const payer = loadPayer()
  const connection = new Connection(rpcUrl(), { commitment: "confirmed", confirmTransactionInitialTimeout: 20000 })
  const mint = new PublicKey(mintAddress)
  const dest = new PublicKey(toOwner)
  const amountBase = BigInt(Math.round(amountTokens * Math.pow(10, decimals)))
  if (amountBase <= BigInt(0)) throw new Error("amount must be positive")

  const fromAta = await getAssociatedTokenAddress(mint, payer.publicKey)
  const toAta = await getAssociatedTokenAddress(mint, dest)
  const tx = new Transaction()
  const toInfo = await withTimeout(connection.getAccountInfo(toAta), LOOKUP_MS, "account lookup")
  if (!toInfo) tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, dest, mint))
  tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, payer.publicKey, amountBase, decimals))

  const { blockhash } = await withTimeout(connection.getLatestBlockhash("confirmed"), LOOKUP_MS, "blockhash fetch")
  tx.recentBlockhash = blockhash
  tx.feePayer = payer.publicKey
  tx.sign(payer)
  const signature = await withTimeout(
    connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }),
    SUBMIT_MS, "submit"
  )
  return { signature, from: payer.publicKey.toBase58() }
}

export async function confirmSig(signature: string): Promise<boolean> {
  try {
    const connection = new Connection(rpcUrl(), "confirmed")
    const res = await withTimeout(connection.getSignatureStatuses([signature]), CONFIRM_MS, "confirm")
    const s = res.value?.[0]
    return !!(s && !s.err && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized"))
  } catch { return false }
}
