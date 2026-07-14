import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  type Connection,
  type PublicKey,
  type Transaction,
} from "@solana/web3.js";

const RPC_TIMEOUT_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 60_000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function prepareForSimulation(
  connection: Connection,
  transaction: Transaction,
  payer: PublicKey
) {
  const latest = await withTimeout(
    connection.getLatestBlockhash("confirmed"),
    RPC_TIMEOUT_MS,
    "The Solana RPC timed out while fetching a blockhash."
  );
  transaction.feePayer = payer;
  transaction.recentBlockhash = latest.blockhash;
  return latest;
}

export async function simulateAndEstimateFee(params: {
  connection: Connection;
  transaction: Transaction;
  payer: PublicKey;
}): Promise<number> {
  await prepareForSimulation(
    params.connection,
    params.transaction,
    params.payer
  );
  const simulation = await withTimeout(
    params.connection.simulateTransaction(params.transaction),
    RPC_TIMEOUT_MS,
    "Transaction simulation timed out. Try again."
  );

  if (simulation.value.err) {
    throw new Error(readSimulationError(simulation.value.logs));
  }

  const fee = await withTimeout(
    params.connection.getFeeForMessage(
      params.transaction.compileMessage(),
      "confirmed"
    ),
    RPC_TIMEOUT_MS,
    "The Solana RPC timed out while estimating the network fee."
  );

  return fee.value ?? 0;
}

export async function signSendAndConfirm(params: {
  connection: Connection;
  wallet: AnchorWallet;
  transaction: Transaction;
  onSimulationSucceeded?: () => void;
  onSignature?: (signature: string) => void;
}): Promise<string> {
  const latest = await prepareForSimulation(
    params.connection,
    params.transaction,
    params.wallet.publicKey
  );
  const simulation = await withTimeout(
    params.connection.simulateTransaction(params.transaction),
    RPC_TIMEOUT_MS,
    "Transaction simulation timed out. Try again."
  );

  if (simulation.value.err) {
    throw new Error(readSimulationError(simulation.value.logs));
  }

  params.onSimulationSucceeded?.();
  const signed = await params.wallet.signTransaction(params.transaction);
  const signature = await withTimeout(
    params.connection.sendRawTransaction(signed.serialize(), {
      maxRetries: 3,
      skipPreflight: false,
    }),
    RPC_TIMEOUT_MS,
    "The Solana RPC timed out while submitting the transaction."
  );
  params.onSignature?.(signature);

  const confirmation = await withTimeout(
    params.connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed"
    ),
    CONFIRM_TIMEOUT_MS,
    "The transaction was submitted but confirmation timed out. Check Explorer."
  );

  if (confirmation.value.err) {
    throw new Error("The transaction failed during confirmation.");
  }

  return signature;
}

function readSimulationError(logs: string[] | null): string {
  const text = logs?.join("\n") ?? "";

  if (text.includes("UnknownRoot")) {
    return "The Merkle root is no longer recognized. Prepare a new proof.";
  }
  if (
    text.includes("ProofVerificationFailed") ||
    text.includes("InvalidProof")
  ) {
    return "The zero-knowledge proof could not be verified.";
  }
  if (text.includes("already in use")) {
    return "This note has already been withdrawn.";
  }
  if (
    text.includes("insufficient lamports") ||
    text.includes("insufficient funds")
  ) {
    return "The connected wallet does not have enough SOL for this transaction and its network fee.";
  }

  return "Transaction simulation failed. Check the selected pool and try again.";
}

export function isWalletRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /reject|declin|cancel/i.test(message);
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}
