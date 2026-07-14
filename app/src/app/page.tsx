import { ArrowDownToLine, LockKeyhole, ShieldCheck } from "lucide-react";

import { ProgramAddress } from "@/components/program-address";
import { VortexInterface } from "@/components/vortex-interface";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { VORTEX_PROGRAM_ID } from "@/lib/vortex-config";

const PROGRAM_ID = VORTEX_PROGRAM_ID.toBase58();

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            aria-label="Vortex home"
          >
            <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-raised text-primary">
              <LockKeyhole className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              Vortex
            </span>
          </a>

          <div className="flex items-center gap-3">
            <div className="hidden min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted-foreground sm:flex">
              <span
                className="size-2 rounded-full bg-warning"
                aria-hidden="true"
              />
              Devnet
            </div>
            <WalletConnectButton />
          </div>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto grid w-full max-w-6xl items-start gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_32rem] lg:gap-16 lg:px-8 lg:py-20"
      >
        <div className="max-w-2xl lg:pt-8">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-widest text-primary uppercase">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Private by proof
          </p>

          <h1 className="max-w-2xl text-4xl leading-tight font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Move SOL without exposing the link.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Deposit into a fixed pool, then withdraw with a zero-knowledge
            proof. Vortex verifies the proof without revealing which deposit is
            yours.
          </p>

          <div className="mt-10">
            <ProgramAddress address={PROGRAM_ID} />
          </div>
        </div>

        <div className="lg:sticky lg:top-24">
          <VortexInterface />
        </div>
      </section>
    </main>
  );
}
