import {
  BROWSER_SNARKJS_GROTH16_BACKEND_ID,
  BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID,
  BrowserSnarkjsGroth16Backend,
  type BrowserSnarkjsProof,
  type BrowserSnarkjsBackendOptions,
} from './browser-snarkjs-backend.js';
import {
  BROWSER_SCHNORR_BACKEND_ID,
  type BrowserSchnorrProof,
  BrowserSchnorrZkpBackend,
} from './zkp-browser-schnorr.js';
import { assertProductionBrowserZkpBackendId } from './browser-zkp-policy.js';

export const DEFAULT_BROWSER_ZKP_BACKEND_ID = BROWSER_SCHNORR_BACKEND_ID;

export type BrowserZkpBackendId =
  | typeof BROWSER_SCHNORR_BACKEND_ID
  | typeof BROWSER_SNARKJS_GROTH16_BACKEND_ID
  | typeof BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID;

export type BrowserZkpBackend =
  | BrowserSchnorrZkpBackend
  | BrowserSnarkjsGroth16Backend;

export interface DefaultBrowserZkpBackendOptions {
  readonly backend?: BrowserZkpBackendId | string;
  readonly groth16?: BrowserSnarkjsBackendOptions;
}

export function createDefaultBrowserZkpBackend(
  options: DefaultBrowserZkpBackendOptions = {},
): BrowserZkpBackend {
  const backend = options.backend ?? DEFAULT_BROWSER_ZKP_BACKEND_ID;
  assertProductionBrowserZkpBackendId(backend, [
    BROWSER_SCHNORR_BACKEND_ID,
    BROWSER_SNARKJS_GROTH16_BACKEND_ID,
    BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID,
  ]);
  if (backend === BROWSER_SCHNORR_BACKEND_ID) {
    return new BrowserSchnorrZkpBackend();
  }
  return new BrowserSnarkjsGroth16Backend({
    ...options.groth16,
    backend,
  });
}

export async function generateDefaultBrowserZkpProof(
  witnessJson: string,
  options: DefaultBrowserZkpBackendOptions & { readonly seed?: number } = {},
): Promise<BrowserSchnorrProof | BrowserSnarkjsProof> {
  const backend = options.backend ?? DEFAULT_BROWSER_ZKP_BACKEND_ID;
  if (backend === BROWSER_SNARKJS_GROTH16_BACKEND_ID || backend === BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID) {
    return new BrowserSnarkjsGroth16Backend({
      ...options.groth16,
      backend,
    }).generateProof(witnessJson);
  }
  assertProductionBrowserZkpBackendId(backend, [BROWSER_SCHNORR_BACKEND_ID]);
  return new BrowserSchnorrZkpBackend().generateProof(witnessJson, options.seed);
}

export async function verifyDefaultBrowserZkpProof(
  proofJson: string,
  options: DefaultBrowserZkpBackendOptions = {},
): Promise<boolean> {
  const backend = createDefaultBrowserZkpBackend(options);
  return backend.verifyProof(proofJson);
}

export {
  BROWSER_SNARKJS_GROTH16_BACKEND_ID,
  BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID,
  BrowserSnarkjsGroth16Backend,
  BrowserSnarkjsProof,
  type BrowserSnarkjsBackendOptions,
  type SnarkJsModule,
  type ZKPBackendProtocol,
} from './browser-snarkjs-backend.js';

export {
  BrowserZkpArtifactIntegrityError,
  BrowserZkpArtifactUnavailableError,
  DEFAULT_BROWSER_GROTH16_CIRCUIT_ID,
  browserGroth16CircuitManifest,
  listBrowserGroth16CircuitIds,
  resolveBrowserGroth16Artifacts,
  verifyBrowserGroth16ArtifactBytes,
  type BrowserGroth16ArtifactDescriptor,
  type BrowserGroth16ArtifactIntegrity,
  type BrowserGroth16ArtifactResolutionOptions,
  type BrowserGroth16ArtifactRole,
  type BrowserGroth16CircuitId,
  type BrowserGroth16CircuitManifest,
  type ResolvedBrowserGroth16Artifacts,
} from './artifacts/index.js';

export {
  BROWSER_SCHNORR_BACKEND_ID,
  BROWSER_SCHNORR_VERIFIER_ID,
  BROWSER_SCHNORR_WASM_ARTIFACT,
  BROWSER_SCHNORR_WASM_BASE64,
  BrowserSchnorrProof,
  BrowserSchnorrZkpBackend,
  browserSchnorrProofFromDict,
  instantiateSchnorrWasmHelper,
  type BrowserSchnorrBackendStats,
  type BrowserSchnorrProofPayload,
  type BrowserSchnorrWasmExports,
  type BrowserSchnorrWitness,
} from './zkp-browser-schnorr.js';

export {
  BrowserZkpSimulationRejectedError,
  REAL_BROWSER_ZKP_BACKEND_IDS,
  SIMULATED_BROWSER_ZKP_BACKEND_IDS,
  TEST_ONLY_SIMULATED_ZKP_SCOPE,
  assertBrowserZkpEnvelopeIsReal,
  assertProductionBrowserZkpBackendId,
  collectBrowserZkpEnvelopeIdentifiers,
  isSimulatedBrowserZkpEnvelope,
  isSimulatedBrowserZkpIdentifier,
  simulatedBrowserZkpEnvelopeReason,
  type BrowserZkpPolicyOptions,
} from './browser-zkp-policy.js';

export {
  base64Encode,
  base64UrlEncode,
  bytesFrom,
  bytesToHex,
  hexToBytes,
  sha256Hex,
  utf8Bytes,
} from '../provers/browser-crypto.js';

export type {
  ZkpBridgeResult,
  ZkpCapabilityEvidence,
  ZkpVerifierId,
} from './zkp-types.js';
