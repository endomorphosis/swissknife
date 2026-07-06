declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: unknown }>;
    verify(
      verificationKey: Record<string, unknown>,
      publicSignals: unknown,
      proof: unknown,
    ): Promise<boolean>;
  };
}
