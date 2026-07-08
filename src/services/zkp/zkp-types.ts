/**
 * ZKP type system for the UCAN-ZKP bridge layer.
 *
 * Mirrors ipfs_datasets_py/logic/zkp/ucan_zkp_bridge.py types:
 *   `ZKPCapabilityEvidence` (the UCAN caveat payload)
 *   `ZkpBridgeResult` (the full bridge operation result)
 *
 * Sprint 11, T-68.
 * Reference: ipfs_datasets_py/logic/zkp/ucan_zkp_bridge.py §ZKPCapabilityEvidence
 */

// ---------------------------------------------------------------------------
// Verifier IDs
// ---------------------------------------------------------------------------

/** Known production ZKP verifier IDs. */
export type ZkpVerifierId =
  | 'groth16-bn254-v0.1'    // Real Groth16 over BN254 (requires artifacts)
  | 'browser-schnorr-zkp-v0.1' // Browser/WASM Schnorr Fiat-Shamir proof of knowledge
  | 'sphinx-zkp-v0.1'       // Sphinx/SP1 backend (via ix CLI)
  | 'lurk-nova-v0.1'        // Lurk + Nova backend
  | 'lurk-plonky3-v0.1';    // Lurk + Plonky3 backend

// ---------------------------------------------------------------------------
// ZkpCapabilityEvidence — UCAN caveat payload
// ---------------------------------------------------------------------------

/**
 * A ZKP proof embedded as a UCAN capability caveat.
 *
 * This is structurally identical to `ZKPCapabilityEvidence` in the Python reference
 * (`ucan_zkp_bridge.py:119`). The `type: "zkp_evidence"` field is the UCAN caveat
 * discriminator, allowing downstream verifiers to recognize and validate the caveat.
 *
 * The `is_simulation` flag is retained for rejecting legacy caveats. Production
 * bridge code emits `false` only.
 */
export interface ZkpCapabilityEvidence {
  /** UCAN caveat discriminator. */
  readonly type: 'zkp_evidence';
  /** SHA-256 hex digest of the proof artifact bytes. */
  readonly proof_hash: string;
  /** Content-ID of the proved theorem string (sha256:<hex>). */
  readonly theorem_cid: string;
  /** Identifier of the backend verifier used. */
  readonly verifier_id: ZkpVerifierId | string;
  /** Public inputs exposed by the proof (theorem is always included). */
  readonly public_inputs: Record<string, unknown>;
  /** True when this is a simulated proof — NOT real cryptography. */
  readonly is_simulation: boolean;
}

// ---------------------------------------------------------------------------
// ZkpBridgeResult — result of ZkpUcanBridge.proveAndDelegate()
// ---------------------------------------------------------------------------

/**
 * Result of a ZKP→UCAN bridging operation.
 *
 * Mirrors `BridgeResult` dataclass in `ucan_zkp_bridge.py:169`.
 */
export interface ZkpBridgeResult {
  /** Whether the bridge operation succeeded. */
  readonly success: boolean;
  /** The theorem that was proved. */
  readonly theorem: string;
  /** DID of the actor who receives the capability. */
  readonly actor: string;
  /** UCAN resource string (e.g. `"mcp++/prove"`, `"logic/proof"`). */
  readonly resource: string;
  /** UCAN ability string (e.g. `"proof/invoke"`, `"mcp++/deontic/prove"`). */
  readonly ability: string;
  /** The ZKP caveat to embed in the UCAN delegation token. */
  readonly zkp_caveat?: ZkpCapabilityEvidence;
  /** The raw ZKP proof artifact (when a real ZK backend was used). */
  readonly proof_artifact?: {
    backend: string;
    artifact_cid: string;
    proof_b64: string;
    proof_time_ms: number;
  };
  /** Non-fatal warnings encountered during bridging. */
  readonly warnings: string[];
  /** Error message when `success === false`. */
  readonly error?: string;
}
