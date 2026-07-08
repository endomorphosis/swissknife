/**
 * ZkpSimulatedProver — simulated ZKP proof generation.
 *
 * Mirrors the simulation (non-Groth16) path of:
 *   ipfs_datasets_py/logic/zkp/zkp_prover.py (289 lines)
 *
 * This prover generates **deterministic, hash-based** proofs that a theorem
 * string is "provable" given a set of private axioms.  It is NOT
 * cryptographically secure — proofs reveal no information other than
 * structural consistency of the hash chain.
 *
 * This module is test-only. Production browser proof selection must use a real
 * backend such as `snarkjs-browser-groth16` and must reject this verifier ID.
 *
 * Sprint 11, T-69.
 * Reference: ipfs_datasets_py/logic/zkp/zkp_prover.py §ZKPProver (simulation path)
 */

import { base64UrlEncode, sha256Hex } from '../provers/browser-crypto.js';

export const ZKP_SIMULATED_VERIFIER_ID = 'simulated-zkp-v0.1' as const;
export const ZKP_SIMULATED_PROVER_SCOPE = 'test-only' as const;

export interface ZkpSimulatedProof {
  readonly statement: string;
  readonly proof_b64: string;
  readonly proof_hash: string;
  readonly statement_cid: string;
  readonly axiom_hashes: string[];
  readonly proof_time_ms: number;
  readonly verifier_id: typeof ZKP_SIMULATED_VERIFIER_ID;
  readonly scope: typeof ZKP_SIMULATED_PROVER_SCOPE;
}

// Maximum proof bytes (mirrors Python <500B target)
const MAX_PROOF_BYTES = 256;

/**
 * Compute a content-ID for an arbitrary UTF-8 string.
 * Format: `sha256:<hex>` (matches the Python `theorem_cid` encoding).
 */
export function computeStatementCid(statement: string): string {
  return 'sha256:' + sha256Hex(statement);
}

/**
 * ZkpSimulatedProver — pure-TypeScript simulated ZKP prover.
 *
 * Produces compact proofs (< 500 bytes) that are deterministic for the same
 * theorem + axioms combination.  Proof generation takes < 1 ms.
 *
 * Usage:
 * ```ts
 * const prover = new ZkpSimulatedProver();
 * const proof = await prover.prove('All agents must log access', ['mcp++/audit']);
 * console.log(proof.proof_hash); // SHA-256 of the proof
 * ```
 */
export class ZkpSimulatedProver {
  /**
   * Generate a simulated ZKP proof.
   *
   * @param statement The theorem string to "prove" (publicly revealed).
   * @param privateAxioms  Private axioms (only their hashes are exposed in output).
   * @returns A `ZkpSimulatedProof` — NOT cryptographically secure.
   */
  async prove(statement: string, privateAxioms: string[] = []): Promise<ZkpSimulatedProof> {
    const start = Date.now();

    // Hash each private axiom so they are never revealed in the proof
    const axiom_hashes = privateAxioms.map(ax =>
      sha256Hex(ax),
    );

    // Build the simulated proof payload
    const payload = {
      theorem: statement,
      axiom_count: axiom_hashes.length,
      axiom_hashes,
      nonce: sha256Hex(statement + axiom_hashes.join('|')).slice(0, 16),
    };

    const payloadJson = JSON.stringify(payload);

    // Truncate to MAX_PROOF_BYTES (mirrors Python <500B target)
    const truncated = payloadJson.slice(0, MAX_PROOF_BYTES);
    const proof_b64 = base64UrlEncode(truncated);
    const proof_hash = sha256Hex(proof_b64);
    const statement_cid = computeStatementCid(statement);

    return {
      statement,
      proof_b64,
      proof_hash,
      statement_cid,
      axiom_hashes,
      proof_time_ms: Date.now() - start,
      verifier_id: ZKP_SIMULATED_VERIFIER_ID,
      scope: ZKP_SIMULATED_PROVER_SCOPE,
    };
  }

  /**
   * Verify a simulated proof.
   *
   * Checks that the `proof_hash` matches the hash of `proof_b64` and that the
   * `statement_cid` matches the SHA-256 of the statement.  This is purely
   * structural — NOT a real ZK verification.
   */
  verify(proof: ZkpSimulatedProof): boolean {
    const expectedHash = sha256Hex(proof.proof_b64);
    const expectedCid = computeStatementCid(proof.statement);
    return proof.proof_hash === expectedHash
      && proof.statement_cid === expectedCid
      && proof.verifier_id === ZKP_SIMULATED_VERIFIER_ID
      && proof.scope === ZKP_SIMULATED_PROVER_SCOPE;
  }
}
