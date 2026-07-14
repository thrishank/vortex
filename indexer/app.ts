import express from "express";
import * as anchor from "@coral-xyz/anchor";
import { buildPoseidon } from "circomlibjs";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";

import { Vortex } from "../target/types/vortex";

//ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=$HOME/.config/solana/id.json esrun indexer/app.ts

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Vortex as Program<Vortex>;

const START_SLOT = Number(process.env.VORTEX_START_SLOT ?? 475114622);
const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
const TREE_DEPTH = 20;
const POOL_AMOUNTS = [100_000_000n, 1_000_000_000n] as const;
const DEPOSIT_DISCRIMINATOR = Uint8Array.from(
  program.idl.instructions.find(
    (instruction) => instruction.name === "deposit"
  )!.discriminator
);

type PoolState = {
  amountLamports: bigint;
  address: PublicKey;
  tree: IncrementalMerkleTree;
};

async function withRpcRetry<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = 5
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      console.warn(
        `${label} failed (${attempt}/${attempts}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function amountSeed(amountLamports: bigint) {
  return new anchor.BN(amountLamports.toString()).toArrayLike(Buffer, "le", 8);
}

function createPoolStates(
  hash: (children: bigint[]) => bigint
): Map<string, PoolState> {
  return new Map(
    POOL_AMOUNTS.map((amountLamports) => {
      const [address] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), amountSeed(amountLamports)],
        program.programId
      );
      const state: PoolState = {
        amountLamports,
        address,
        tree: new IncrementalMerkleTree(hash, TREE_DEPTH, 0n, 2),
      };
      return [address.toBase58(), state];
    })
  );
}

function matchesDiscriminator(data: Uint8Array) {
  return DEPOSIT_DISCRIMINATOR.every((byte, index) => data[index] === byte);
}

function findDepositPool(
  tx: NonNullable<
    Awaited<ReturnType<typeof provider.connection.getTransaction>>
  >
) {
  const message = tx.transaction.message;
  const accountKeys = message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  });
  const instruction = message.compiledInstructions.find((candidate) => {
    const programId = accountKeys.get(candidate.programIdIndex);
    return (
      programId?.equals(program.programId) &&
      matchesDiscriminator(candidate.data)
    );
  });

  if (!instruction) return undefined;

  const poolIndex = instruction.accountKeyIndexes[2];
  return accountKeys.get(poolIndex);
}

function insertDeposit(
  state: PoolState,
  commitment: bigint,
  leafIndex: number
) {
  if (leafIndex < state.tree.leaves.length) {
    if (state.tree.leaves[leafIndex] === commitment) return;
    throw new Error(
      `Conflicting leaf ${leafIndex} in ${state.amountLamports.toString()} pool`
    );
  }

  if (leafIndex !== state.tree.leaves.length) {
    throw new Error(
      `Missing leaves before ${leafIndex} in ${state.amountLamports.toString()} pool`
    );
  }

  state.tree.insert(commitment);
}

async function replayDeposits(states: Map<string, PoolState>) {
  const connection = provider.connection;
  let before: string | undefined;
  const signatures: string[] = [];

  while (true) {
    const page = await withRpcRetry("Signature history request", () =>
      connection.getSignaturesForAddress(
        program.programId,
        { before, limit: 1000 },
        "confirmed"
      )
    );

    if (page.length === 0) break;

    for (const signature of page) {
      if (signature.slot >= START_SLOT) signatures.push(signature.signature);
    }

    before = page[page.length - 1].signature;
    if (page[page.length - 1].slot < START_SLOT) break;
  }

  signatures.reverse();
  console.log(`Replaying ${signatures.length} transactions`);

  for (const signature of signatures) {
    const tx = await withRpcRetry(`Transaction ${signature}`, () =>
      connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
    );

    if (!tx?.meta?.logMessages) continue;

    const poolAddress = findDepositPool(tx);
    const state = poolAddress && states.get(poolAddress.toBase58());
    if (!state) continue;

    for (const log of tx.meta.logMessages) {
      if (!log.startsWith("Program data: ")) continue;
      const event = program.coder.events.decode(
        log.replace("Program data: ", "")
      );

      if (!event || event.name !== "depositEvent") continue;

      const commitment = BigInt(
        `0x${Buffer.from(event.data.commitment).toString("hex")}`
      );
      insertDeposit(state, commitment, event.data.leafIndex);
    }
  }

  for (const state of states.values()) {
    console.log(
      `Pool ${state.amountLamports.toString()}: ${
        state.tree.leaves.length
      } leaves, root ${state.tree.root.toString()}`
    );
  }
}

async function getTransactionWithRetry(signature: string) {
  return withRpcRetry(`Live transaction ${signature}`, async () => {
    const tx = await provider.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) throw new Error(`Transaction ${signature} is not available yet`);
    return tx;
  });
}

function poolFromParam(states: Map<string, PoolState>, value: string) {
  const normalized =
    value === "0.1" ? "100000000" : value === "1" ? "1000000000" : value;
  return [...states.values()].find(
    (state) => state.amountLamports.toString() === normalized
  );
}

function proofResponse(state: PoolState, index: number) {
  const proof = state.tree.createProof(index);
  return {
    root: state.tree.root.toString(),
    leaf: state.tree.leaves[index].toString(),
    leafIndex: index,
    proof: {
      pathElements: proof.siblings.map((level) => level[0].toString()),
      pathIndices: proof.pathIndices,
    },
  };
}

async function index() {
  const poseidon = await buildPoseidon();
  const hash = (children: bigint[]) =>
    BigInt(poseidon.F.toString(poseidon(children)));
  const states = createPoolStates(hash);

  await replayDeposits(states);

  let liveQueue = Promise.resolve();
  program.addEventListener("depositEvent", (event, _slot, signature) => {
    liveQueue = liveQueue
      .then(async () => {
        const tx = await getTransactionWithRetry(signature);
        if (!tx) throw new Error(`Could not load deposit ${signature}`);

        const poolAddress = findDepositPool(tx);
        const state = poolAddress && states.get(poolAddress.toBase58());
        if (!state) throw new Error(`Unknown pool in deposit ${signature}`);

        const commitment = BigInt(
          `0x${Buffer.from(event.commitment).toString("hex")}`
        );
        insertDeposit(state, commitment, event.leafIndex);
        console.log(
          `Inserted leaf ${
            event.leafIndex
          } in ${state.amountLamports.toString()} pool`
        );
      })
      .catch((error) => console.error("Live deposit indexing failed", error));
  });

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      pools: [...states.values()].map((state) => ({
        amountLamports: state.amountLamports.toString(),
        leaves: state.tree.leaves.length,
        root: state.tree.root.toString(),
      })),
    });
  });

  app.get("/proof/:amount/:commitment", (req, res) => {
    const state = poolFromParam(states, req.params.amount);
    if (!state)
      return res.status(400).json({ error: "Unsupported pool amount" });

    let commitment: bigint;
    try {
      commitment = BigInt(req.params.commitment);
    } catch {
      return res.status(400).json({ error: "Invalid commitment" });
    }

    const index = state.tree.indexOf(commitment);
    if (index < 0) {
      return res.status(404).json({
        error: "Deposit not indexed yet. Wait a few seconds and try again.",
      });
    }

    return res.json(proofResponse(state, index));
  });

  app.get("/root/:amount", (req, res) => {
    const state = poolFromParam(states, req.params.amount);
    if (!state)
      return res.status(400).json({ error: "Unsupported pool amount" });
    return res.json({ root: state.tree.root.toString() });
  });

  app.get("/leaves/:amount", (req, res) => {
    const state = poolFromParam(states, req.params.amount);
    if (!state)
      return res.status(400).json({ error: "Unsupported pool amount" });
    return res.json({
      leaves: state.tree.leaves.map((leaf) => leaf.toString()),
    });
  });

  app.listen(PORT, () => {
    console.log(`Indexer listening on http://localhost:${PORT}`);
  });
}

index().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
