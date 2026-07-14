import * as anchor from "@coral-xyz/anchor";
import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import { buildPoseidon } from "circomlibjs";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import path from "path";
import { Program } from "@coral-xyz/anchor";
import { Vortex } from "../target/types/vortex";
import { loadAndConvertProof } from "./proof";
import { assert } from "chai";

describe("vortex", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vortex as Program<Vortex>;

  const signer = provider.wallet;

  function bigintToBytes32(x: bigint): number[] {
    return [...Buffer.from(x.toString(16).padStart(64, "0"), "hex")];
  }

  // it("initalize", async () => {
  //   const deposit = new anchor.BN(100_000_000);
  //   const [tree, bump] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tree"), deposit.toArrayLike(Buffer, "le", 8)],
  //     program.programId
  //   );
  //
  //   const [pool] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("pool"), deposit.toArrayLike(Buffer, "le", 8)],
  //     program.programId
  //   );
  //
  //   console.log(tree.toString(), pool.toString());
  //
  //   const tx = await program.methods
  //     .initialize(deposit)
  //     .accountsPartial({
  //       admin: signer.publicKey,
  //       tree,
  //       pool,
  //     })
  //     .preInstructions([
  //       ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
  //     ])
  //     .rpc();
  //
  //   console.log(tx);
  // });

  it("deposit", async () => {
    const nullifier = BigInt(Math.floor(Math.random() * 1_000_000));
    const secret = BigInt(Math.floor(Math.random() * 1_000_000));

    const poseidon = await buildPoseidon();

    const commitment = poseidon.F.toObject(poseidon([nullifier, secret]));

    console.log(nullifier, secret);

    const tx = await program.methods
      .deposit(bigintToBytes32(commitment))
      .accountsPartial({
        signer: signer.publicKey,
        tree: new PublicKey("48PshoWs8eka2vNq7WD2FqrQgczmeGGFaJPMgbfuXhME"),
        pool: new PublicKey("FK3xGr9ZhCKPB5goPSw5TWhjZeGenizWMgKecEXiHsKi"),
      })
      .signers([signer.payer!])
      .rpc();

    console.log("signature: ", tx);
  });

  it("verify proof", async () => {
    const poseidon = await buildPoseidon();

    const commitment = poseidon.F.toObject(poseidon([488786n, 461395n]));
    const indexerUrl =
      process.env.VORTEX_INDEXER_URL ?? "http://localhost:3001";
    const proof = await fetch(
      `${indexerUrl}/proof/100000000/${commitment.toString()}`
    );
    const res = (await proof.json()) as {
      root: string;
      leaf: string;
      proof: { pathElements: string[]; pathIndices: number[] };
    };

    const nullifier = "488786";
    const secret = "461395";

    const input = {
      nullifier,
      secret,
      pathElements: res.proof.pathElements,
      pathIndices: res.proof.pathIndices,
      root: res.root,
      nullifierHash: poseidon.F.toObject(poseidon([488786n])).toString(),
      recipient:
        "0x" +
        Buffer.from(
          new PublicKey(
            "372sKPyyiwU5zYASHzqvYY48Sv4ihEujfN5rGFKhVQ9j"
          ).toBytes()
        ).toString("hex"),
    };

    const inputPath = path.join(process.cwd(), "input.json");

    await writeFile(inputPath, JSON.stringify(input, null, 2));

    await run("node", [
      "artifacts/vortex_js/generate_witness.js",
      "artifacts/vortex_js/vortex.wasm",
      "input.json",
      "witness.wtns",
    ]);

    await run("snarkjs", [
      "groth16",
      "prove",
      "vortex_0000.zkey",
      "witness.wtns",
      "proof.json",
      "public.json",
    ]);

    // const proofPath = path.join(__dirname, "fixtures", "proof.json");
    // const publicPath = path.join(__dirname, "fixtures", "public.json");

    const proofPath = path.join(process.cwd(), "proof.json");
    const publicPath = path.join(process.cwd(), "public.json");

    const { proofA, proofB, proofC, root, nullifierHash, recipient } =
      loadAndConvertProof(proofPath, publicPath);

    assert.equal(proofA.length, 64);
    assert.equal(proofB.length, 128);
    assert.equal(proofC.length, 64);

    const tx = await program.methods
      .withdraw(nullifierHash, root, recipient, proofA, proofB, proofC)
      .accountsPartial({
        signer: signer.publicKey,
        recipient: new PublicKey(
          "372sKPyyiwU5zYASHzqvYY48Sv4ihEujfN5rGFKhVQ9j"
        ),
        tree: new PublicKey("48PshoWs8eka2vNq7WD2FqrQgczmeGGFaJPMgbfuXhME"),
        pool: new PublicKey("FK3xGr9ZhCKPB5goPSw5TWhjZeGenizWMgKecEXiHsKi"),
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      ])
      .rpc();

    console.log("Your transaction signature", tx);

    await run("rm", [
      "witness.wtns",
      "input.json",
      "proof.json",
      "public.json",
    ]);
  });
});

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Exited with ${code}`));
    });
  });
}
