declare module "snarkjs" {
  export type Groth16Proof = {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
  };

  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(
      verificationKey: Record<string, unknown>,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
}
