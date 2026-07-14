"use client";

import { AlertCircle } from "lucide-react";

export default function ErrorPage({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <span className="grid size-10 place-items-center rounded-lg bg-muted text-destructive">
          <AlertCircle className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Vortex could not load</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is usually a temporary wallet or network issue. Try loading the
          interface again.
        </p>
        <button
          type="button"
          onClick={unstable_retry}
          className="mt-6 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
