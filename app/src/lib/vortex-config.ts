import { PublicKey } from "@solana/web3.js";

import vortexIdl from "@/idl/vortex.json";
import type { Vortex } from "@/idl/vortex";

export const VORTEX_IDL = vortexIdl as unknown as Vortex;
export const VORTEX_PROGRAM_ID = new PublicKey(VORTEX_IDL.address);
export const VORTEX_NETWORK = "devnet" as const;

export const POOLS = [
  { amountSol: "0.1", amountLamports: 100_000_000n },
  { amountSol: "1", amountLamports: 1_000_000_000n },
] as const;

export type Pool = (typeof POOLS)[number];
export type PoolAmountSol = Pool["amountSol"];

export const VORTEX_INDEXER_URL = (
  process.env.NEXT_PUBLIC_VORTEX_INDEXER_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export function getPoolBySol(amountSol: string): Pool | undefined {
  return POOLS.find((pool) => pool.amountSol === amountSol);
}

export function getPoolByLamports(amountLamports: string): Pool | undefined {
  return POOLS.find(
    (pool) => pool.amountLamports.toString() === amountLamports
  );
}

export function u64ToLittleEndian(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

export function derivePoolAccounts(amountLamports: bigint) {
  const amountSeed = u64ToLittleEndian(amountLamports);
  const [tree] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("tree"), amountSeed],
    VORTEX_PROGRAM_ID
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("pool"), amountSeed],
    VORTEX_PROGRAM_ID
  );

  return { tree, pool };
}

export function deriveNullifierAccount(nullifierHash: number[]) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("nullifer"), Uint8Array.from(nullifierHash)],
    VORTEX_PROGRAM_ID
  )[0];
}

export function explorerTransactionUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${VORTEX_NETWORK}`;
}
