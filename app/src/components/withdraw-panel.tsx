"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type Connection } from "@solana/web3.js";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  FileUp,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

import { SecretField } from "@/components/secret-field";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import type { Vortex } from "@/idl/vortex";
import {
  deriveNullifierAccount,
  explorerTransactionUrl,
  getPoolByLamports,
} from "@/lib/vortex-config";
import {
  bigintToBytes32,
  bytesToHex,
  poseidonHash,
} from "@/lib/vortex-crypto";
import {
  createVortexNoteFromSecrets,
  parseAndVerifyVortexNote,
  type VortexNote,
  verifyVortexSecrets,
} from "@/lib/vortex-note";
import {
  fetchMerkleProof,
  findPoolContainingCommitment,
  generateWithdrawalProof,
  type ConvertedProof,
} from "@/lib/vortex-proof";
import { buildWithdrawTransaction } from "@/lib/vortex-program";
import {
  errorMessage,
  isWalletRejection,
  signSendAndConfirm,
  simulateAndEstimateFee,
} from "@/lib/vortex-transaction";

type WithdrawPanelProps = {
  connection: Connection;
  wallet: AnchorWallet | undefined;
  program: Program<Vortex> | null;
};

type PreparedWithdrawal = {
  proof: ConvertedProof;
  recipient: PublicKey;
};

type NoteInputMethod = "file" | "manual";

function formatFee(lamports: number | null) {
  if (lamports === null) return "—";
  return `${(lamports / 1_000_000_000).toFixed(6)} SOL`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WithdrawPanel({
  connection,
  wallet,
  program,
}: WithdrawPanelProps) {
  const [note, setNote] = useState<VortexNote | null>(null);
  const [noteInputMethod, setNoteInputMethod] =
    useState<NoteInputMethod>("file");
  const [manualNullifier, setManualNullifier] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [manualNullifierError, setManualNullifierError] = useState<
    string | null
  >(null);
  const [manualSecretError, setManualSecretError] = useState<string | null>(
    null
  );
  const [recipient, setRecipient] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedWithdrawal | null>(null);
  const [networkFee, setNetworkFee] = useState<number | null>(null);
  const [rent, setRent] = useState<number | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const isBusy = busyMessage !== null;

  function resetPrepared() {
    setPrepared(null);
    setNetworkFee(null);
    setRent(null);
    setSignature(null);
    setConfirmed(false);
  }

  function acceptNote(verifiedNote: VortexNote) {
    setNote(verifiedNote);
    if (wallet) setRecipient(wallet.publicKey.toBase58());
  }

  function changeNoteInputMethod(method: NoteInputMethod) {
    if (method === noteInputMethod) return;
    setNoteInputMethod(method);
    setNote(null);
    setError(null);
    setManualNullifierError(null);
    setManualSecretError(null);
    resetPrepared();
  }

  async function importNote(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setRecipientError(null);
    setBusyMessage("Verifying private note…");
    resetPrepared();

    try {
      const verifiedNote = await parseAndVerifyVortexNote(file);
      acceptNote(verifiedNote);
    } catch (reason) {
      setNote(null);
      setError(errorMessage(reason));
    } finally {
      setBusyMessage(null);
      event.target.value = "";
    }
  }

  async function importManualNote() {
    const nullifier = manualNullifier.trim();
    const secret = manualSecret.trim();
    const nullifierRequired = nullifier ? null : "Enter the nullifier.";
    const secretRequired = secret ? null : "Enter the secret.";

    setManualNullifierError(nullifierRequired);
    setManualSecretError(secretRequired);
    setError(null);
    if (nullifierRequired || secretRequired) return;

    setBusyMessage("Verifying private secrets…");
    resetPrepared();

    try {
      const secrets = await verifyVortexSecrets(nullifier, secret);
      setBusyMessage("Finding your deposit…");
      const pool = await findPoolContainingCommitment(secrets.commitment);
      acceptNote(createVortexNoteFromSecrets(pool, secrets));
    } catch (reason) {
      setNote(null);
      const message = errorMessage(reason);
      if (message.toLowerCase().includes("nullifier")) {
        setManualNullifierError(message);
      } else if (message.toLowerCase().includes("secret")) {
        setManualSecretError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusyMessage(null);
    }
  }

  function validateRecipient() {
    setRecipientError(null);

    let recipientKey: PublicKey;
    try {
      recipientKey = new PublicKey(recipient.trim());
    } catch {
      setRecipientError("Enter a valid Solana recipient address.");
      return null;
    }

    return recipientKey;
  }

  async function buildTransaction(
    proof: ConvertedProof,
    recipientKey: PublicKey
  ) {
    if (!wallet || !program || !note) {
      throw new Error("Connect a wallet and import a note first.");
    }

    return buildWithdrawTransaction({
      program,
      signer: wallet.publicKey,
      recipient: recipientKey,
      amountLamports: BigInt(note.amountLamports),
      proof,
    });
  }

  async function prepareWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    resetPrepared();

    if (!note) {
      setError("Import a Vortex note before preparing a withdrawal.");
      return;
    }
    if (!wallet || !program) {
      setError("Connect a wallet to pay the withdrawal transaction fee.");
      return;
    }

    const validatedRecipient = validateRecipient();
    if (!validatedRecipient) return;

    const pool = getPoolByLamports(note.amountLamports);
    if (!pool) {
      setError("The note uses an unsupported pool amount.");
      return;
    }

    try {
      setBusyMessage("Finding deposit in the Merkle tree…");
      const [merkleProof, rentLamports] = await Promise.all([
        fetchMerkleProof(note.amountLamports, note.commitment),
        connection.getMinimumBalanceForRentExemption(40, "confirmed"),
      ]);

      if (merkleProof.leaf !== note.commitment) {
        throw new Error("The indexer returned a different deposit commitment.");
      }

      const nullifierHash = await poseidonHash([BigInt(note.nullifier)]);
      const nullifierHashBytes = Array.from(bigintToBytes32(nullifierHash));
      const nullifierAccount = deriveNullifierAccount(nullifierHashBytes);
      const spentAccount = await connection.getAccountInfo(
        nullifierAccount,
        "confirmed"
      );
      if (spentAccount) {
        throw new Error("This private note has already been withdrawn.");
      }

      setBusyMessage("Generating zero-knowledge proof…");
      const recipientHex = `0x${bytesToHex(
        validatedRecipient.toBytes()
      )}`;
      const { converted } = await generateWithdrawalProof({
        nullifier: note.nullifier,
        secret: note.secret,
        pathElements: merkleProof.proof.pathElements,
        pathIndices: merkleProof.proof.pathIndices,
        root: merkleProof.root,
        nullifierHash: nullifierHash.toString(),
        recipient: recipientHex,
      });

      setBusyMessage("Simulating withdrawal…");
      const transaction = await buildTransaction(
        converted,
        validatedRecipient
      );
      const fee = await simulateAndEstimateFee({
        connection,
        transaction,
        payer: wallet.publicKey,
      });

      setPrepared({
        proof: converted,
        recipient: validatedRecipient,
      });
      setNetworkFee(fee);
      setRent(rentLamports);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyMessage(null);
    }
  }

  async function submitWithdrawal() {
    if (!wallet || !program || !note || !prepared) return;

    setError(null);
    setBusyMessage("Approve the withdrawal in your wallet…");
    try {
      const transaction = await buildTransaction(
        prepared.proof,
        prepared.recipient
      );
      const confirmedSignature = await signSendAndConfirm({
        connection,
        wallet,
        transaction,
        onSignature: (submittedSignature) => {
          setSignature(submittedSignature);
          setBusyMessage("Confirming withdrawal on Solana…");
        },
      });
      setSignature(confirmedSignature);
      setConfirmed(true);
      setBusyMessage(null);
    } catch (reason) {
      setBusyMessage(null);
      if (!isWalletRejection(reason)) setError(errorMessage(reason));
    }
  }

  if (confirmed && note && signature) {
    return (
      <div aria-live="polite">
        <span className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-semibold">Withdrawal confirmed</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {note.amountSol} SOL was sent to {shortAddress(recipient)}. This note
          is now spent and cannot be used again.
        </p>
        <a
          href={explorerTransactionUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          View transaction
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">
          Private withdrawal
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          Provide your private note
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The proof is generated locally. Your secret and nullifier never leave
          this browser.
        </p>
      </div>

      <form onSubmit={prepareWithdrawal} className="mt-6">
        <fieldset>
          <legend className="text-sm font-medium">Note source</legend>
          <div className="mt-2 grid grid-cols-2 border-b border-border">
            <button
              type="button"
              onClick={() => changeNoteInputMethod("file")}
              aria-pressed={noteInputMethod === "file"}
              className={`flex min-h-11 items-center justify-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                noteInputMethod === "file"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <FileUp className="size-4" aria-hidden="true" />
              Upload file
            </button>
            <button
              type="button"
              onClick={() => changeNoteInputMethod("manual")}
              aria-pressed={noteInputMethod === "manual"}
              className={`flex min-h-11 items-center justify-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                noteInputMethod === "manual"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <ClipboardPaste className="size-4" aria-hidden="true" />
              Enter secrets
            </button>
          </div>
        </fieldset>

        {noteInputMethod === "file" ? (
          <label
            htmlFor="vortex-note"
            className="mt-5 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-5 text-center transition-colors hover:border-muted-foreground hover:bg-surface-raised focus-within:ring-2 focus-within:ring-ring"
          >
            {busyMessage === "Verifying private note…" ? (
              <LoaderCircle
                className="size-5 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <FileUp className="size-5 text-primary" aria-hidden="true" />
            )}
            <span className="mt-2 text-sm font-semibold">
              {note ? "Replace private note" : "Choose private note file"}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              vortex-nullifier-secret-*.json
            </span>
            <input
              id="vortex-note"
              type="file"
              accept="application/json,.json"
              onChange={importNote}
              disabled={isBusy}
              className="sr-only"
            />
          </label>
        ) : (
          <div className="mt-5">
            <div>
              <label htmlFor="manual-nullifier" className="text-sm font-medium">
                Nullifier
              </label>
              <input
                id="manual-nullifier"
                type="text"
                inputMode="numeric"
                value={manualNullifier}
                onChange={(event) => {
                  setManualNullifier(event.target.value);
                  setManualNullifierError(null);
                  setNote(null);
                  resetPrepared();
                }}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={manualNullifierError ? "true" : undefined}
                aria-describedby={
                  manualNullifierError ? "manual-nullifier-error" : undefined
                }
                className="mt-2 min-h-12 w-full rounded-lg border border-border bg-surface-raised px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="Enter Nullifier"
              />
              {manualNullifierError && (
                <p
                  id="manual-nullifier-error"
                  className="mt-2 text-xs text-destructive"
                >
                  {manualNullifierError}
                </p>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="manual-secret" className="text-sm font-medium">
                Secret
              </label>
              <input
                id="manual-secret"
                type="text"
                inputMode="numeric"
                value={manualSecret}
                onChange={(event) => {
                  setManualSecret(event.target.value);
                  setManualSecretError(null);
                  setNote(null);
                  resetPrepared();
                }}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={manualSecretError ? "true" : undefined}
                aria-describedby={
                  manualSecretError ? "manual-secret-error" : "manual-secret-help"
                }
                className="mt-2 min-h-12 w-full rounded-lg border border-border bg-surface-raised px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="Enter Secret"
              />
              {manualSecretError ? (
                <p
                  id="manual-secret-error"
                  className="mt-2 text-xs text-destructive"
                >
                  {manualSecretError}
                </p>
              ) : (
                <p
                  id="manual-secret-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  Values are verified locally and never leave this browser.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={importManualNote}
              disabled={isBusy}
              aria-busy={
                busyMessage === "Verifying private secrets…" ||
                busyMessage === "Finding your deposit…"
              }
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(busyMessage === "Verifying private secrets…" ||
                busyMessage === "Finding your deposit…") && (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {busyMessage === "Verifying private secrets…" ||
              busyMessage === "Finding your deposit…"
                ? busyMessage
                : note
                  ? "Secrets verified"
                  : "Use these secrets"}
            </button>
          </div>
        )}

        {note && (
          <>
            <div className="mt-5 grid grid-cols-2 border-y border-border py-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Pool</p>
                <p className="mt-1 font-mono font-semibold tabular-nums">
                  {note.amountSol} SOL
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Network</p>
                <p className="mt-1 font-medium capitalize">{note.network}</p>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <SecretField label="Nullifier" value={note.nullifier} />
              <SecretField label="Secret" value={note.secret} />
            </div>

            <div className="mt-5">
              <label htmlFor="recipient" className="text-sm font-medium">
                Recipient address
              </label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setRecipientError(null);
                  resetPrepared();
                }}
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={recipientError ? "true" : undefined}
                aria-describedby={
                  recipientError ? "recipient-error" : "recipient-help"
                }
                className="mt-2 min-h-12 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="Solana address"
              />
              {wallet && recipient !== wallet.publicKey.toBase58() && (
                <button
                  type="button"
                  onClick={() => {
                    setRecipient(wallet.publicKey.toBase58());
                    setRecipientError(null);
                    resetPrepared();
                  }}
                  className="mt-2 min-h-9 text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Use connected wallet
                </button>
              )}
              {recipientError ? (
                <p
                  id="recipient-error"
                  className="mt-2 text-xs text-destructive"
                >
                  {recipientError}
                </p>
              ) : (
                <p
                  id="recipient-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  The proof is bound to this address and cannot be redirected.
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-3 rounded-lg border border-border bg-background p-4">
              <ShieldAlert
                className="mt-0.5 size-5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                The connected wallet pays network fees and nullifier-account
                rent. For stronger privacy, use a fresh fee-payer wallet.
              </p>
            </div>

            {prepared && (
              <dl className="mt-5 space-y-3 border-y border-border py-5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Recipient receives</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {note.amountSol} SOL
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Recipient</dt>
                  <dd className="font-mono text-xs">
                    {shortAddress(prepared.recipient.toBase58())}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    Estimated network fee
                  </dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatFee(networkFee)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    Nullifier account rent
                  </dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatFee(rent)}
                  </dd>
                </div>
              </dl>
            )}
          </>
        )}

        {error && (
          <div
            className="mt-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p>{error}</p>
          </div>
        )}

        {signature && !confirmed && (
          <a
            href={explorerTransactionUrl(signature)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Check submitted transaction
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}

        <div className="mt-5">
          {!wallet || !program ? (
            <WalletConnectButton />
          ) : !prepared ? (
            <button
              type="submit"
              disabled={isBusy || !note}
              aria-busy={isBusy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy && (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {busyMessage ?? "Prepare withdrawal"}
            </button>
          ) : (
            <button
              type="button"
              onClick={submitWithdrawal}
              disabled={isBusy}
              aria-busy={isBusy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy && (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {busyMessage ?? `Withdraw ${note?.amountSol} SOL`}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
