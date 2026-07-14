"use client";

import { useState, type FormEvent } from "react";
import type { Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileKey2,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

import { SecretField } from "@/components/secret-field";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import type { Vortex } from "@/idl/vortex";
import { explorerTransactionUrl, POOLS, type Pool } from "@/lib/vortex-config";
import { bigintToBytes32 } from "@/lib/vortex-crypto";
import {
  createVortexNote,
  downloadVortexNote,
  type VortexNote,
} from "@/lib/vortex-note";
import { buildDepositTransaction } from "@/lib/vortex-program";
import {
  errorMessage,
  isWalletRejection,
  signSendAndConfirm,
} from "@/lib/vortex-transaction";

type DepositPanelProps = {
  connection: Connection;
  wallet: AnchorWallet | undefined;
  program: Program<Vortex> | null;
};

export function DepositPanel({
  connection,
  wallet,
  program,
}: DepositPanelProps) {
  const [pool, setPool] = useState<Pool>(POOLS[0]);
  const [note, setNote] = useState<VortexNote | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const isBusy = busyMessage !== null;

  async function startDeposit() {
    setError(null);
    setBusyMessage("Preparing deposit…");
    try {
      setNote(await createVortexNote(pool));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyMessage(null);
    }
  }

  function downloadNote() {
    if (!note) return;
    downloadVortexNote(note);
    setNoteSaved(true);
  }

  async function buildTransaction() {
    if (!wallet || !program || !note) {
      throw new Error("Connect a wallet before preparing the deposit.");
    }

    return buildDepositTransaction({
      program,
      signer: wallet.publicKey,
      amountLamports: BigInt(note.amountLamports),
      commitment: bigintToBytes32(BigInt(note.commitment)),
    });
  }

  async function submitDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!noteSaved) {
      setError("Download and save the private note before depositing.");
      return;
    }
    if (!wallet || !program || !note) {
      setError("Connect a wallet before depositing.");
      return;
    }

    setError(null);
    setBusyMessage("Simulating deposit…");
    try {
      const transaction = await buildTransaction();
      const confirmedSignature = await signSendAndConfirm({
        connection,
        wallet,
        transaction,
        onSimulationSucceeded: () => {
          setBusyMessage("Approve the deposit in your wallet…");
        },
        onSignature: (submittedSignature) => {
          setSignature(submittedSignature);
          setBusyMessage("Confirming deposit on Solana…");
        },
      });
      const updatedNote: VortexNote = {
        ...note,
        depositSignature: confirmedSignature,
        depositedAt: new Date().toISOString(),
      };
      setNote(updatedNote);
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
        <h2 className="mt-5 text-xl font-semibold">Deposit confirmed</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your commitment is in the {note.amountSol} SOL pool. Download the
          updated note and keep it private until withdrawal.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={downloadNote}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            <Download className="size-4" aria-hidden="true" />
            Download updated note
          </button>
          <a
            href={explorerTransactionUrl(signature)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            View transaction
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">
          Private deposit
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          Deposit privately
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose an amount to begin. You will save a private withdrawal note
          before the transaction is sent.
        </p>
      </div>

      {!note ? (
        <div className="mt-6">
          <fieldset>
            <legend className="text-sm font-medium">Deposit amount</legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {POOLS.map((option) => {
                const selected = pool.amountSol === option.amountSol;
                return (
                  <button
                    key={option.amountSol}
                    type="button"
                    onClick={() => setPool(option)}
                    aria-pressed={selected}
                    className={`relative min-h-16 rounded-lg border px-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-foreground hover:border-muted-foreground hover:bg-surface-raised"
                    }`}
                  >
                    {selected && (
                      <CheckCircle2
                        className="absolute top-3 right-3 size-4 text-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {option.amountSol}
                    </span>{" "}
                    <span className="text-sm font-medium">SOL</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={startDeposit}
            disabled={isBusy}
            aria-busy={isBusy}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? (
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <FileKey2 className="size-4" aria-hidden="true" />
            )}
            {busyMessage ?? `Continue with ${pool.amountSol} SOL`}
          </button>

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
        </div>
      ) : (
        <form onSubmit={submitDeposit} className="mt-6">
          <div className="flex gap-3 rounded-lg border border-border bg-background p-4">
            <ShieldAlert
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Save this note before depositing
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Anyone with this file can withdraw the funds. Keep it offline
                or in an encrypted password manager. Never put it in cloud
                notes, chat, email, or screenshots. Vortex cannot recover it.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <SecretField label="Nullifier" value={note.nullifier} />
            <SecretField label="Secret" value={note.secret} />
          </div>

          <button
            type="button"
            onClick={downloadNote}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Download className="size-4" aria-hidden="true" />
            Download vortex-nullifier-secret file
          </button>

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm text-foreground">
            <input
              type="checkbox"
              checked={noteSaved}
              onChange={(event) => setNoteSaved(event.target.checked)}
              className="size-5 rounded border-border bg-background accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            I saved the note file somewhere private.
          </label>

          <dl className="mt-5 space-y-3 border-y border-border py-5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Deposit</dt>
              <dd className="font-mono font-medium tabular-nums">
                {note.amountSol} SOL
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Program</dt>
              <dd className="font-mono text-xs">Vortex</dd>
            </div>
          </dl>

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
            ) : (
              <button
                type="submit"
                disabled={isBusy || !noteSaved}
                aria-busy={isBusy}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy && (
                  <LoaderCircle
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {busyMessage ?? `Simulate & deposit ${note.amountSol} SOL`}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
