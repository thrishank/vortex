import { buildPoseidon, type Poseidon } from "circomlibjs";

export const BN254_SCALAR_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

let poseidonPromise: Promise<Poseidon> | undefined;

async function getPoseidon() {
  poseidonPromise ??= buildPoseidon();
  return poseidonPromise;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  return BigInt(poseidon.F.toString(poseidon(inputs)));
}

export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);

  do {
    crypto.getRandomValues(bytes);
  } while (bytes.every((byte) => byte === 0));

  return bytesToBigint(bytes);
}

export function bigintToBytes32(value: bigint): number[] {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error("Value does not fit in 32 bytes.");
  }

  const bytes = new Array<number>(32).fill(0);
  let remaining = value;

  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

export function bytesToBigint(bytes: Uint8Array | number[]): bigint {
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  return value;
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export function isCircuitFieldElement(value: bigint) {
  return value >= 0n && value < BN254_SCALAR_FIELD;
}
