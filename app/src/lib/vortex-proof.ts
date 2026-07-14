import type { Groth16Proof } from "snarkjs";

import {
  POOLS,
  type Pool,
  VORTEX_INDEXER_URL,
} from "@/lib/vortex-config";
import { bigintToBytes32 } from "@/lib/vortex-crypto";

const BN254_BASE_FIELD = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583"
);

const TREE_DEPTH = 20;
const PROOF_TIMEOUT_MS = 30_000;

export type IndexerMerkleProof = {
  root: string;
  leaf: string;
  leafIndex: number;
  proof: {
    pathElements: string[];
    pathIndices: number[];
  };
};

export type ConvertedProof = {
  proofA: number[];
  proofB: number[];
  proofC: number[];
  root: number[];
  nullifierHash: number[];
  recipient: number[];
};

let verificationKeyPromise: Promise<Record<string, unknown>> | undefined;

function feBytes(value: string): number[] {
  return bigintToBytes32(BigInt(value));
}

function g1BytesNegated(point: [string, string, string]): number[] {
  const negatedY = (BN254_BASE_FIELD - BigInt(point[1])) % BN254_BASE_FIELD;
  return [...feBytes(point[0]), ...feBytes(negatedY.toString())];
}

function g1Bytes(point: [string, string, string]): number[] {
  return [...feBytes(point[0]), ...feBytes(point[1])];
}

function g2Bytes(
  point: [[string, string], [string, string], [string, string]]
): number[] {
  const [x0, x1] = point[0];
  const [y0, y1] = point[1];
  return [...feBytes(x1), ...feBytes(x0), ...feBytes(y1), ...feBytes(y0)];
}

export function convertGroth16Proof(
  proof: Groth16Proof,
  publicSignals: string[]
): ConvertedProof {
  if (publicSignals.length !== 3) {
    throw new Error("The proof did not return three public signals.");
  }

  const [root, nullifierHash, recipient] = publicSignals;

  return {
    proofA: g1BytesNegated(proof.pi_a),
    proofB: g2Bytes(proof.pi_b),
    proofC: g1Bytes(proof.pi_c),
    root: feBytes(root),
    nullifierHash: feBytes(nullifierHash),
    recipient: feBytes(recipient),
  };
}

export async function fetchMerkleProof(
  amountLamports: string,
  commitment: string
): Promise<IndexerMerkleProof> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROOF_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${VORTEX_INDEXER_URL}/proof/${amountLamports}/${commitment}`,
      { signal: controller.signal }
    );
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "The Vortex indexer could not find this deposit.";
      throw new Error(message);
    }

    return validateMerkleProof(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The Vortex indexer timed out. Try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function findPoolContainingCommitment(
  commitment: string
): Promise<Pool> {
  try {
    return await Promise.any(
      POOLS.map(async (pool) => {
        const proof = await fetchMerkleProof(
          pool.amountLamports.toString(),
          commitment
        );

        if (proof.leaf !== commitment) {
          throw new Error("The indexer returned a different commitment.");
        }

        return pool;
      })
    );
  } catch {
    throw new Error(
      "No supported Vortex deposit contains this commitment. Check both values and try again."
    );
  }
}

function validateMerkleProof(value: unknown): IndexerMerkleProof {
  if (!value || typeof value !== "object") {
    throw new Error("The Vortex indexer returned an invalid proof.");
  }

  const proof = value as Partial<IndexerMerkleProof>;

  if (
    typeof proof.root !== "string" ||
    typeof proof.leaf !== "string" ||
    typeof proof.leafIndex !== "number" ||
    !proof.proof ||
    !Array.isArray(proof.proof.pathElements) ||
    !Array.isArray(proof.proof.pathIndices) ||
    proof.proof.pathElements.length !== TREE_DEPTH ||
    proof.proof.pathIndices.length !== TREE_DEPTH ||
    !proof.proof.pathElements.every((item) => typeof item === "string") ||
    !proof.proof.pathIndices.every((item) => item === 0 || item === 1)
  ) {
    throw new Error("The Vortex indexer returned an invalid Merkle path.");
  }

  return proof as IndexerMerkleProof;
}

async function getVerificationKey() {
  verificationKeyPromise ??= fetch("/zk/verification_key.json").then(
    async (response) => {
      if (!response.ok) {
        throw new Error(
          "The local proof verification key could not be loaded."
        );
      }
      return (await response.json()) as Record<string, unknown>;
    }
  );
  return verificationKeyPromise;
}

export async function generateWithdrawalProof(input: {
  nullifier: string;
  secret: string;
  pathElements: string[];
  pathIndices: number[];
  root: string;
  nullifierHash: string;
  recipient: string;
}): Promise<{ converted: ConvertedProof; publicSignals: string[] }> {
  const { groth16 } = await import("snarkjs");
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    "/zk/vortex.wasm",
    "/zk/vortex_0000.zkey"
  );
  const isValid = await groth16.verify(
    await getVerificationKey(),
    publicSignals,
    proof
  );

  if (!isValid) {
    throw new Error(
      "The generated zero-knowledge proof failed local verification."
    );
  }

  return {
    converted: convertGroth16Proof(proof, publicSignals),
    publicSignals,
  };
}
