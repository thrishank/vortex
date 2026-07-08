import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram } from "@solana/web3.js";
import path from "path";
import { Program } from "@coral-xyz/anchor";
import { Vortex } from "../target/types/vortex";
import { loadAndConvertProof } from "./proof";
import { assert } from "chai";

describe("vortex", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.vortex as Program<Vortex>;

  it("verify proof", async () => {
    const proofPath = path.join(__dirname, "fixtures", "proof.json");
    const publicPath = path.join(__dirname, "fixtures", "public.json");

    const { proofA, proofB, proofC, publicInputs } = loadAndConvertProof(
      proofPath,
      publicPath
    );

    assert.equal(proofA.length, 64);
    assert.equal(proofB.length, 128);
    assert.equal(proofC.length, 64);
    publicInputs.forEach((pi) => assert.equal(pi.length, 32));

    const tx = await program.methods
      .withdraw(proofA, proofB, proofC, publicInputs)
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      ])
      .rpc();

    console.log("Your transaction signature", tx);
  });
});
