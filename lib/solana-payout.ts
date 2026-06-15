import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, transferChecked } from "@solana/spl-token"
import bs58 from "bs58"

/**
 * USDC payout sender. Signs and broadcasts a USDC transfer from the payout
 * wallet (key in PAYOUT_WALLET_SECRET) to a player's address. Used only by the
 * admin withdrawals send endpoint, never exposed to players.
 *
 * PAYOUT_WALLET_SECRET accepts either a base58 secret key (Phantom export) or a
 * JSON byte array. Fund this wallet with USDC (and a little SOL for fees and
 * one-time recipient token-account rent). Keep only what you need in it.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
const USDC_DECIMALS = 6

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

export type SendResult = { signature: string; from: string }

export async function sendUsdc(toOwner: string, amountUsdc: number): Promise<SendResult> {
  if (!(amountUsdc > 0)) throw new Error("amount must be positive")
  const connection = new Connection(rpcUrl(), "confirmed")
  const payer = loadPayer()
  const dest = new PublicKey(toOwner) // throws on an invalid address

  const fromAta = await getAssociatedTokenAddress(USDC_MINT, payer.publicKey)
  // Make sure the recipient has a USDC account; payer funds its rent if missing.
  const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, USDC_MINT, dest)

  const amountBase = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS))
  const signature = await transferChecked(
    connection, payer, fromAta, USDC_MINT, toAta.address, payer, amountBase, USDC_DECIMALS,
  )
  return { signature, from: payer.publicKey.toBase58() }
}
