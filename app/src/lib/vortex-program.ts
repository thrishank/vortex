import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  type Connection,
  type PublicKey,
} from "@solana/web3.js";

import type { Vortex } from "@/idl/vortex";
import {
  deriveNullifierAccount,
  derivePoolAccounts,
  VORTEX_IDL,
} from "@/lib/vortex-config";
import type { ConvertedProof } from "@/lib/vortex-proof";

const DEPOSIT_COMPUTE_UNITS = 1_000_000;
const WITHDRAW_COMPUTE_UNITS = 1_000_000;

export function createVortexProgram(
  connection: Connection,
  wallet: AnchorWallet
): Program<Vortex> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  return new Program<Vortex>(VORTEX_IDL as unknown as Idl, provider);
}

export async function buildDepositTransaction(params: {
  program: Program<Vortex>;
  signer: PublicKey;
  amountLamports: bigint;
  commitment: number[];
}) {
  const { tree, pool } = derivePoolAccounts(params.amountLamports);

  return params.program.methods
    .deposit(params.commitment)
    .accountsPartial({
      signer: params.signer,
      tree,
      pool,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: DEPOSIT_COMPUTE_UNITS,
      }),
    ])
    .transaction();
}

export async function buildWithdrawTransaction(params: {
  program: Program<Vortex>;
  signer: PublicKey;
  recipient: PublicKey;
  amountLamports: bigint;
  proof: ConvertedProof;
}) {
  const { tree, pool } = derivePoolAccounts(params.amountLamports);
  const nullifierAccount = deriveNullifierAccount(params.proof.nullifierHash);

  return params.program.methods
    .withdraw(
      params.proof.nullifierHash,
      params.proof.root,
      params.proof.recipient,
      params.proof.proofA,
      params.proof.proofB,
      params.proof.proofC
    )
    .accountsPartial({
      signer: params.signer,
      recipient: params.recipient,
      tree,
      pool,
      nullifierAccount,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: WITHDRAW_COMPUTE_UNITS,
      }),
    ])
    .transaction();
}
