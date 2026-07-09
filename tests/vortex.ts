import * as anchor from "@coral-xyz/anchor";
import { buildPoseidon } from "circomlibjs";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import path from "path";
import { Program } from "@coral-xyz/anchor";
import { Vortex } from "../target/types/vortex";
import { loadAndConvertProof } from "./proof";
import { assert } from "chai";
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";

describe("vortex", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vortex as Program<Vortex>;

  const signer = provider.wallet;

  async function index() {
    const poseidon = await buildPoseidon();

    const hash = (children: bigint[]) =>
      BigInt(poseidon.F.toString(poseidon(children)));

    const tree = new IncrementalMerkleTree(hash, 20, 0n, 2);

    program.addEventListener("depositEvent", (event) => {
      const leaf = BigInt("0x" + Buffer.from(event.commitment).toString("hex"));

      tree.insert(leaf);

      console.log("Inserted:", leaf.toString());
      console.log("Merkle root:", tree.root.toString());
    });
  }

  index();

  function bigintToBytes32(x: bigint): number[] {
    return [...Buffer.from(x.toString(16).padStart(64, "0"), "hex")];
  }

  it("deposit", async () => {
    const nullifier = BigInt(Math.floor(Math.random() * 1_000_000));
    const secret = BigInt(Math.floor(Math.random() * 1_000_000));

    const poseidon = await buildPoseidon();

    const commitment = poseidon.F.toObject(poseidon([nullifier, secret]));

    console.log(nullifier, secret);

    const tx = await program.methods
      .deposit(bigintToBytes32(commitment))
      .accounts({
        signer: signer.publicKey,
        pool: new PublicKey("EXBdeRCdiNChKyD7akt64n9HgSXEpUtpPEhmbnm4L6iH"),
      })
      .signers([signer.payer!])
      .rpc();

    console.log("signature: ", tx);
  });

  // it("verify proof", async () => {
  //   const proofPath = path.join(__dirname, "fixtures", "proof.json");
  //   const publicPath = path.join(__dirname, "fixtures", "public.json");
  //
  //   const { proofA, proofB, proofC, publicInputs } = loadAndConvertProof(
  //     proofPath,
  //     publicPath
  //   );
  //
  //   assert.equal(proofA.length, 64);
  //   assert.equal(proofB.length, 128);
  //   assert.equal(proofC.length, 64);
  //   publicInputs.forEach((pi) => assert.equal(pi.length, 32));
  //
  //   const tx = await program.methods
  //     .withdraw(proofA, proofB, proofC, publicInputs)
  //     .preInstructions([
  //       ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
  //     ])
  //     .rpc();
  //
  //   console.log("Your transaction signature", tx);
  // });
});
