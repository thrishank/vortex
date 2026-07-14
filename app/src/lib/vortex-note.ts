import {
  getPoolByLamports,
  getPoolBySol,
  type Pool,
  VORTEX_NETWORK,
  VORTEX_PROGRAM_ID,
} from "@/lib/vortex-config";
import {
  BN254_SCALAR_FIELD,
  poseidonHash,
  randomFieldElement,
} from "@/lib/vortex-crypto";

export type VortexNote = {
  version: 1;
  protocol: "vortex";
  network: typeof VORTEX_NETWORK;
  programId: string;
  amountSol: Pool["amountSol"];
  amountLamports: string;
  nullifier: string;
  secret: string;
  commitment: string;
  createdAt: string;
  depositSignature?: string;
  depositedAt?: string;
};

const DECIMAL_FIELD = /^(0|[1-9]\d*)$/;
const MAX_NOTE_BYTES = 32 * 1024;

export async function createVortexNote(pool: Pool): Promise<VortexNote> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await poseidonHash([nullifier, secret]);

  return {
    version: 1,
    protocol: "vortex",
    network: VORTEX_NETWORK,
    programId: VORTEX_PROGRAM_ID.toBase58(),
    amountSol: pool.amountSol,
    amountLamports: pool.amountLamports.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitment.toString(),
    createdAt: new Date().toISOString(),
  };
}

export type VerifiedVortexSecrets = Pick<
  VortexNote,
  "nullifier" | "secret" | "commitment"
>;

export async function verifyVortexSecrets(
  nullifierInput: string,
  secretInput: string
): Promise<VerifiedVortexSecrets> {
  const nullifier = parseSecretField(nullifierInput, "nullifier");
  const secret = parseSecretField(secretInput, "secret");
  const commitment = await poseidonHash([nullifier, secret]);

  return {
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitment.toString(),
  };
}

export function createVortexNoteFromSecrets(
  pool: Pool,
  secrets: VerifiedVortexSecrets
): VortexNote {
  return {
    version: 1,
    protocol: "vortex",
    network: VORTEX_NETWORK,
    programId: VORTEX_PROGRAM_ID.toBase58(),
    amountSol: pool.amountSol,
    amountLamports: pool.amountLamports.toString(),
    ...secrets,
    createdAt: new Date().toISOString(),
  };
}

function parseSecretField(value: string, name: "nullifier" | "secret") {
  const normalized = value.trim();

  if (!DECIMAL_FIELD.test(normalized)) {
    throw new Error(`The ${name} must be a non-negative decimal number.`);
  }

  const field = BigInt(normalized);
  if (field >= BN254_SCALAR_FIELD) {
    throw new Error(`The ${name} is outside the circuit field.`);
  }

  return field;
}

export async function parseAndVerifyVortexNote(
  file: File
): Promise<VortexNote> {
  if (file.size > MAX_NOTE_BYTES) {
    throw new Error("The note file is too large to be a Vortex note.");
  }

  let value: unknown;

  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("The selected file is not a Vortex note.");
  }

  const note = value as Partial<VortexNote>;

  if (note.version !== 1 || note.protocol !== "vortex") {
    throw new Error("This note version is not supported.");
  }

  if (note.network !== VORTEX_NETWORK) {
    throw new Error(
      `This note belongs to ${note.network ?? "another network"}.`
    );
  }

  if (note.programId !== VORTEX_PROGRAM_ID.toBase58()) {
    throw new Error("This note belongs to a different Vortex program.");
  }

  if (
    typeof note.amountLamports !== "string" ||
    typeof note.amountSol !== "string" ||
    getPoolByLamports(note.amountLamports)?.amountSol !== note.amountSol ||
    getPoolBySol(note.amountSol)?.amountLamports.toString() !==
      note.amountLamports
  ) {
    throw new Error("The note contains an unsupported pool amount.");
  }

  for (const [name, field] of [
    ["nullifier", note.nullifier],
    ["secret", note.secret],
    ["commitment", note.commitment],
  ] as const) {
    if (typeof field !== "string" || !DECIMAL_FIELD.test(field)) {
      throw new Error(`The note ${name} is invalid.`);
    }

    if (BigInt(field) >= BN254_SCALAR_FIELD) {
      throw new Error(`The note ${name} is outside the circuit field.`);
    }
  }

  if (
    typeof note.createdAt !== "string" ||
    Number.isNaN(Date.parse(note.createdAt))
  ) {
    throw new Error("The note creation date is invalid.");
  }

  const nullifier = note.nullifier as string;
  const secret = note.secret as string;
  const commitment = note.commitment as string;
  const expectedCommitment = await poseidonHash([
    BigInt(nullifier),
    BigInt(secret),
  ]);

  if (expectedCommitment.toString() !== commitment) {
    throw new Error("The note secrets do not match its commitment.");
  }

  return note as VortexNote;
}

export function downloadVortexNote(note: VortexNote) {
  const blob = new Blob([JSON.stringify(note, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = note.createdAt.replace(/[:.]/g, "-");

  link.href = url;
  link.download = `vortex-nullifier-secret-${note.amountSol}-sol-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
