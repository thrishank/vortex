# Vortex frontend

Dark Next.js interface for the Vortex Solana privacy pool. It supports 0.1 and 1 SOL deposits, downloadable private notes, browser-side Groth16 proof generation, note import, withdrawal, and Wallet Standard-compatible wallets.

## Run locally

From the repository root, start the Merkle-tree indexer in one terminal:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
pnpm indexer
```

Then start the frontend in a second terminal:

```bash
cd app
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The frontend defaults to Solana devnet and expects the indexer at `http://localhost:3001`. To change either endpoint, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SOLANA_RPC_URL` or `NEXT_PUBLIC_VORTEX_INDEXER_URL`.

## Private notes

A deposit creates a `vortex-nullifier-secret-*.json` file containing the nullifier and secret required to withdraw. The app does not upload or persist this file. Losing it makes the deposit unrecoverable; anyone who obtains it can prepare a withdrawal.

The withdrawal proof is generated and verified locally in the browser from the bundled circuit artifacts. The imported note never leaves the browser. The connected wallet only pays the withdrawal network fee and nullifier-account rent.

## Checks

```bash
pnpm lint
pnpm build
```

## Completed

- Built the Next.js frontend under app with a dark green theme and Solana wallet connection.
- Added Deposit and Withdraw tabs.
- Deposit flow:

  - 0.1 and 1 SOL pool selection.
  - Cryptographically random nullifier and secret generation.
  - Poseidon commitment generation.
  - Secret/nullifier display and copy controls.
  - Downloads vortex-nullifier-secret-\*.json.
  - Requires confirmation that the note was saved.
  - Transaction simulation, fee estimate, wallet approval, confirmation, and Explorer link.

- Withdrawal flow:

  - Imports the private note JSON file.
  - Validates program, network, pool, fields, and recomputed commitment.
  - Displays the imported nullifier and secret.
  - Accepts a recipient or uses the connected wallet.
  - Detects already-spent notes through the nullifier PDA.
  - Fetches the Merkle path from the indexer.
  - Generates and locally verifies the Groth16 proof in the browser.
  - Converts the proof exactly like tests/proof.ts, including negating proof A.
  - Simulates withdrawal, shows fee/rent, submits, confirms, and links to Explorer.

- Bundled the current IDL, WASM, zkey, and verification key.
- Updated the indexer in indexer/app.ts:

  - Separate Merkle trees for 0.1 and 1 SOL pools.
  - Historical replay and live deposit indexing.
  - Commitment-based proof lookup.
  - Health endpoint and CORS.
  - RPC retry handling and proper failure exit status.

- Added pnpm indexer and documented local setup in app/README.md.
- Replaced the remaining yellow accent with green.
- Updated the Anchor test to use the new indexer endpoint.

## Verification completed

- Frontend ESLint passes.
- Next.js production build and TypeScript checks pass.
- Indexer TypeScript check passes.
- Real Groth16 proof generation and local verification pass.
- Frontend proof conversion matches the Anchor test byte-for-byte.
- Valid note import passes and tampered notes are rejected.
- Indexer starts successfully and /health returns both pools with correct CORS headers.

## Still pending

1. Real end-to-end devnet transaction test

   No actual deposit or withdrawal was submitted because that moves devnet funds and could spend the hard-coded test note. Test
   both flows with a funded wallet.

2. Reliable RPC for the indexer

   The public devnet RPC rate-limited the full historical replay. Retry handling is implemented, but use a dedicated RPC by setting
   ANCHOR_PROVIDER_URL.

3. Verify both pools are initialized

   Confirm that the 0.1 and 1 SOL tree/pool accounts are initialized and funded on the deployed devnet program. An uninitialized
   option will fail safely during simulation.

4. Recipient circuit limitation

   The current circuit represents the recipient as one BN254 field element, so many Solana public keys are outside the accepted
   range. The UI detects this and asks for another wallet, but the proper fix requires updating the circuit, verifier key, and
   program to encode the recipient safely.

5. Production indexer persistence

   The indexer currently reconstructs state from chain history at startup. Before production, add persistent storage/checkpoints,
   monitoring, and a hosted deployment.

6. Security and trusted-setup review

   Before mainnet, independently audit the program, circuit, verifier key generation, note format, indexer correctness, and
   trusted-setup provenance.

7. Production configuration

   Mainnet program deployment, production RPC/indexer URLs, hosting, monitoring, and operational recovery procedures are not
   configured.

8. Final wallet/browser QA

   Run the complete flow in Phantom/Solflare across mobile and desktop, including wallet rejection, confirmation timeout,
   insufficient balance, already-spent note, and indexer-unavailable states.
