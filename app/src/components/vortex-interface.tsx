"use client";

import { useMemo, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

import { DepositPanel } from "@/components/deposit-panel";
import { WithdrawPanel } from "@/components/withdraw-panel";
import { createVortexProgram } from "@/lib/vortex-program";

type Mode = "deposit" | "withdraw";

export function VortexInterface() {
  const [mode, setMode] = useState<Mode>("deposit");
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const program = useMemo(
    () => (wallet ? createVortexProgram(connection, wallet) : null),
    [connection, wallet]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className="grid grid-cols-2 border-b border-border px-5"
        role="tablist"
        aria-label="Transfer type"
      >
        {(["deposit", "withdraw"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            role="tab"
            id={`vortex-${item}-tab`}
            aria-selected={mode === item}
            aria-controls="vortex-transfer-panel"
            className={`min-h-14 border-b-2 px-4 text-sm font-semibold capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none cursor-pointer ${
              mode === item
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        id="vortex-transfer-panel"
        role="tabpanel"
        aria-labelledby={`vortex-${mode}-tab`}
        className="p-5 sm:p-7"
      >
        {mode === "deposit" ? (
          <DepositPanel
            connection={connection}
            wallet={wallet}
            program={program}
          />
        ) : (
          <WithdrawPanel
            connection={connection}
            wallet={wallet}
            program={program}
          />
        )}
      </div>
    </section>
  );
}
