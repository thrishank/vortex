"use client";

import { useState } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";

type ProgramAddressProps = {
  address: string;
};

export function ProgramAddress({ address }: ProgramAddressProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 1600);
  }

  const buttonLabel =
    copyState === "copied"
      ? "Program address copied"
      : copyState === "error"
      ? "Could not copy program address"
      : "Copy program address";

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1">
      <button
        type="button"
        onClick={copyAddress}
        className="flex min-h-10 items-center gap-2 rounded-md px-3 font-mono text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={buttonLabel}
      >
        {copyState === "copied" ? (
          <Check className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy
            className="size-4 text-muted-foreground cursor-pointer"
            aria-hidden="true"
          />
        )}
        <span aria-live="polite">
          {copyState === "copied"
            ? "Copied"
            : copyState === "error"
            ? "Copy failed"
            : shortAddress}
        </span>
      </button>
      <a
        href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="View program on Solana Explorer"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>

      <a
        href="https://github.com/thrishank/vortex"
        target="_blank"
        rel="noreferrer"
        className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="View Code"
      >
        <Code2 className="size-4" aria-hidden="true" />
      </a>
    </div>
  );
}
