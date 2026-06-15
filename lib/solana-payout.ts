import {
  Connection, Keypair, PublicKey, Transaction,
} from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"
import bs58 from "bs58"

/**
 * USDC payout sender. Signs and broadcasts a USDC transfer from the payout
 * wallet (PAYOUT_WALLET_SECRET) to a player's address. Admin-only.
 *
 * Built to never hang: it submits the transaction and gets a signature fast,
 * then waits only a bounded time for confirmation. If confirmation is slow it
 * still returns the signature (the transfer is already broadcast) with
 * confirmed=false, so the row is marked sent and can be checked on Solscan.
 * It only throws when submission itself fails, i.e. nothing went out.
 *
 * PAYOUT_WALLET_SECRET accepts a base58 secret key (Phantom export) or a JSON
 * byte array. Fund the wallet with USDC plus a little SOL for fees and the
 * one-time rent if a recipient has no USDC account yet.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
const USDC_DECIMALS = 6
const CONFIRM_TIMEOUT_MS = 18000

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

export type SendResult = { signature: string; from: string; confirmed: boolean }

export async function sendUsdc(toOwner: string, amountUsdc: number): Promise<SendResult> {
  if (!(amountUsdc > 0)) throw new Error("amount must be positive")
  const connection = new Connection(rpcUrl(), "confirmed")
  const payer = loadPayer()
  const dest = new PublicKey(toOwner) // throws on an invalid address

  const fromAta = await getAssociatedTokenAddress(USDC_MINT, payer.publicKey)
  const toAta = await getAssociatedTokenAddress(USDC_MINT, dest)
  const amountBase = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS))

  const tx = new Transaction()

  // Create the recipient's USDC account in the same transaction if it's missing.
  const toInfo = await connection.getAccountInfo(toAta)
  if (!toInfo) {
    tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, dest, USDC_MINT))
  }

  tx.add(createTransferCheckedInstruction(
    fromAta, USDC_MINT, toAta, payer.publicKey, amountBase, USDC_DECIMALS,
  ))

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
  tx.recentBlockhash = blockhash
  tx.feePayer = payer.publicKey
  tx.sign(payer)

  // Submit. This returns quickly with a signature; the network does the rest.
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false, maxRetries: 3,
  })

  // Wait only a bounded time for confirmation. Either way we already have a
  // signature, so the transfer is out on the network.
  let confirmed = false
  try {
    confirmed = await Promise.race([
      connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed").then(() => true),
      new Promise<boolean>((res) => setTimeout(() => res(false), CONFIRM_TIMEOUT_MS)),
    ])
  } catch { confirmed = false }

  return { signature, from: payer.publicKey.toBase58(), confirmed }
}
