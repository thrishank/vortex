"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type SecretFieldProps = {
  label: string;
  value: string;
};

export function SecretField({ label, value }: SecretFieldProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <button
          type="button"
          onClick={copy}
          className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copyState === "copied" ? (
            <Check className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          <span aria-live="polite">
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy"}
          </span>
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-xs leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}
