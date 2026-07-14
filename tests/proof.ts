import * as fs from "fs";

/** Convert a decimal-string field element into 32 big-endian bytes. */
export function feBytes(x: string): number[] {
  let n = BigInt(x);
  const bytes = new Array<number>(32).fill(0);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

/** G1 point (snarkjs affine [x, y, 1]) -> 64 bytes: x || y */
export function g1Bytes(p: [string, string, string]): number[] {
  return [...feBytes(p[0]), ...feBytes(p[1])];
}

// BN254 base field prime (the modulus x/y coordinates live in).
const BN254_FIELD_PRIME = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583"
);

/**
 * groth16-solana's pairing check uses -A, not A, and does NOT negate it
 * internally — the caller must supply proof_a already negated. On an
 * elliptic curve, -P = (x, p - y), so we just negate the y-coordinate
 * mod the field prime and re-encode as G1 bytes.
 */
export function g1BytesNegated(p: [string, string, string]): number[] {
  const negY = (BN254_FIELD_PRIME - BigInt(p[1])) % BN254_FIELD_PRIME;
  return [...feBytes(p[0]), ...feBytes(negY.toString())];
}

/**
 * G2 point (snarkjs affine [[x0,x1],[y0,y1],[1,0]]) -> 128 bytes:
 * x1 || x0 || y1 || y0  (imaginary component first — same convention
 * used when the verifying key was generated).
 */
export function g2Bytes(
  p: [[string, string], [string, string], [string, string]]
): number[] {
  const [x0, x1] = p[0];
  const [y0, y1] = p[1];
  return [...feBytes(x1), ...feBytes(x0), ...feBytes(y1), ...feBytes(y0)];
}

export interface SnarkjsProof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

export interface ConvertedProof {
  proofA: number[]; // length 64
  proofB: number[]; // length 128
  proofC: number[]; // length 64
  root: number[];
  nullifierHash: number[];
  recipient: number[];
}

/** Load proof.json + public.json produced by `snarkjs groth16 prove` and
 *  convert them into the byte layout the on-chain instruction expects. */
export function loadAndConvertProof(
  proofPath: string,
  publicPath: string
): ConvertedProof {
  const proof: SnarkjsProof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

  const publicSignals = JSON.parse(
    fs.readFileSync(publicPath, "utf8")
  ) as unknown;

  if (!Array.isArray(publicSignals)) {
    throw new Error("public.json must contain an array");
  }

  if (
    !publicSignals.every(
      (signal): signal is string => typeof signal === "string"
    )
  ) {
    throw new Error("Every entry in public.json must be a decimal string");
  }

  const PUBLIC_INPUT_COUNT = 3;

  if (publicSignals.length !== PUBLIC_INPUT_COUNT) {
    throw new Error(
      `Expected ${PUBLIC_INPUT_COUNT} public signals ` +
        `[root, nullifierHash, recipient], ` +
        `received ${publicSignals.length}`
    );
  }

  const [rootString, nullifierHashString, recipient] = publicSignals;

  return {
    proofA: g1BytesNegated(proof.pi_a), // negated — see g1BytesNegated
    proofB: g2Bytes(proof.pi_b),
    proofC: g1Bytes(proof.pi_c),

    root: feBytes(rootString),
    nullifierHash: feBytes(nullifierHashString),
    recipient: feBytes(recipient),
  };
}
