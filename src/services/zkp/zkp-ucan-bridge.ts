/**
 * ZkpUcanBridge — converts ZKP proof artifacts to UCAN capability evidence caveats.
 *
 * Mirrors ipfs_datasets_py/logic/zkp/ucan_zkp_bridge.py (592 lines):
 *   class ZKPToUCANBridge
 *   class ZKPCapabilityEvidence
 *   class BridgeResult
 *
 * Conceptual flow (matching Python reference):
 *
 *   theorem string
 *     │
 *     ▼  [1] ZKPProver (real: LurkWasmBridge/proveWithIx; sim: ZkpSimulatedProver)
 *   proof artifact { proof_b64, artifact_cid, backend, … }
 *     │
 *     ▼  [2] proofToCaveat()
 *   ZkpCapabilityEvidence { type:"zkp_evidence", proof_hash, theorem_cid, … }
 *     │
 *     ▼  [3] Embed in UCAN delegation token (via DelegationManager)
 *   Signed delegation with ZKP evidence caveat
 *
 * The bridge gracefully degrades to the simulated prover when no real ZK
 * backend is available (lurk-wasm absent, ix CLI absent).
 *
 * Sprint 11, T-70.
 * Reference: ipfs_datasets_py/logic/zkp/ucan_zkp_bridge.py §ZKPToUCANBridge
 */

import { createHash } from 'node:crypto';
import type { ZKProofArtifact } from '../provers/lurk-wasm-bridge.js';
import type {
  ZkpCapabilityEvidence,
  ZkpBridgeResult,
  ZkpVerifierId,
} from './zkp-types.js';
import { ZkpSimulatedProver, ZKP_SIMULATED_VERIFIER_ID, computeStatementCid } from './zkp-simulated-prover.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ZkpUcanBridgeOptions {
  /**
   * Verifier ID to embed in caveats.  Defaults to 'simulated-zkp-v0.1'.
   * When a real ZK artifact is supplied, the artifact's backend is used instead.
   */
  verifierId?: ZkpVerifierId | string;
  /**
   * DID of the issuer.  Defaults to 'did:key:issuer' (test mode).
   */
  issuerDid?: string;
}

// ---------------------------------------------------------------------------
// ZkpUcanBridge
// ---------------------------------------------------------------------------

/**
 * ZkpUcanBridge — bridges ZKP proofs to UCAN capability caveats.
 *
 * Two main entry points:
 *   `proofToCaveat(artifact)` — convert a `ZKProofArtifact` to a UCAN caveat.
 *   `proveAndDelegate(theorem, actor, resource, ability)` — full pipeline.
 */
export class ZkpUcanBridge {
  private readonly verifierId: string;
  private readonly issuerDid: string;
  private readonly simProver: ZkpSimulatedProver;

  constructor(opts: ZkpUcanBridgeOptions = {}) {
    this.verifierId = opts.verifierId ?? ZKP_SIMULATED_VERIFIER_ID;
    this.issuerDid = opts.issuerDid ?? 'did:key:issuer';
    this.simProver = new ZkpSimulatedProver();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Convert a `ZKProofArtifact` (from `LurkWasmBridge` or `proveWithIx`)
   * into a UCAN-embeddable `ZkpCapabilityEvidence` caveat.
   *
   * The `proof_hash` is the SHA-256 of the proof bytes (`proof_b64`).
   * The `theorem_cid` is the SHA-256 of the `statement` string.
   * `is_simulation` is `false` for real ZK artifacts.
   *
   * Mirrors `ZKPToUCANBridge._make_caveat()` in the Python reference.
   */
  proofToCaveat(artifact: ZKProofArtifact): ZkpCapabilityEvidence {
    const proof_hash = createHash('sha256')
      .update(artifact.proof_b64, 'utf8')
      .digest('hex');
    const theorem_cid = computeStatementCid(artifact.statement);

    const verifier_id = this._backendToVerifierId(artifact.backend);

    return {
      type: 'zkp_evidence',
      proof_hash,
      theorem_cid,
      verifier_id,
      public_inputs: { theorem: artifact.statement },
      is_simulation: false,
    };
  }

  /**
   * Convert a simulated proof to a UCAN caveat.
   * `is_simulation` is `true` — NOT cryptographically secure.
   */
  simulatedProofToCaveat(
    proofHash: string,
    statementCid: string,
    publicInputs: Record<string, unknown> = {},
  ): ZkpCapabilityEvidence {
    return {
      type: 'zkp_evidence',
      proof_hash: proofHash,
      theorem_cid: statementCid,
      verifier_id: ZKP_SIMULATED_VERIFIER_ID,
      public_inputs: publicInputs,
      is_simulation: true,
    };
  }

  /**
   * Full bridge pipeline: prove a theorem and produce a UCAN delegation result.
   *
   * 1. Attempts to use a real ZK proof via `realProver` (injected) if provided.
   * 2. Falls back to `ZkpSimulatedProver` when no real prover is available.
   * 3. Packages the proof as a `ZkpCapabilityEvidence` caveat.
   * 4. Returns `ZkpBridgeResult` with the caveat + delegation metadata.
   *
   * Note: actual UCAN JWT signing requires `DelegationManager` and a real DID key.
   * This method returns the caveat and metadata so callers can complete signing
   * using the existing `src/auth/delegation-manager.ts`.
   *
   * Mirrors `ZKPToUCANBridge.prove_and_delegate()` in the Python reference.
   */
  async proveAndDelegate(
    theorem: string,
    actor: string,
    resource: string,
    ability: string,
    opts: {
      privateAxioms?: string[];
      /**
       * Optional real ZK prover. If provided and returns a `ZKProofArtifact`,
       * a non-simulation caveat is produced.  Errors are caught and demoted to
       * simulation-path with a warning.
       */
      realProver?: () => Promise<ZKProofArtifact | null>;
    } = {},
  ): Promise<ZkpBridgeResult> {
    const warnings: string[] = [];
    let zkp_caveat: ZkpCapabilityEvidence | undefined;
    let proof_artifact: ZkpBridgeResult['proof_artifact'] | undefined;

    // --- Attempt real ZK prover ---
    if (opts.realProver) {
      try {
        const artifact = await opts.realProver();
        if (artifact) {
          zkp_caveat = this.proofToCaveat(artifact);
          proof_artifact = {
            backend: artifact.backend,
            artifact_cid: artifact.artifact_cid,
            proof_b64: artifact.proof_b64,
            proof_time_ms: artifact.proof_time_ms,
          };
        } else {
          warnings.push('Real ZK prover returned null — falling back to simulation.');
        }
      } catch (err) {
        warnings.push(`Real ZK prover failed (${err instanceof Error ? err.message : String(err)}) — falling back to simulation.`);
      }
    }

    // --- Simulation fallback ---
    if (!zkp_caveat) {
      const simProof = await this.simProver.prove(theorem, opts.privateAxioms);
      zkp_caveat = this.simulatedProofToCaveat(
        simProof.proof_hash,
        simProof.statement_cid,
        { theorem },
      );
      if (opts.realProver) {
        warnings.push('Caveat is a SIMULATION — replace with real ZK proof in production.');
      }
    }

    return {
      success: true,
      theorem,
      actor,
      resource,
      ability,
      zkp_caveat,
      proof_artifact,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _backendToVerifierId(backend: ZKProofArtifact['backend']): ZkpVerifierId {
    switch (backend) {
      case 'sphinx':   return 'sphinx-zkp-v0.1';
      case 'nova':     return 'lurk-nova-v0.1';
      case 'plonky3':  return 'lurk-plonky3-v0.1';
      case 'lurk':     return 'lurk-nova-v0.1';
      default:         return 'simulated-zkp-v0.1';
    }
  }
}
