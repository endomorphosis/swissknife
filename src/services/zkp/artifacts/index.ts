import { sha256Hex } from '../../provers/browser-crypto.js';

export const DEFAULT_BROWSER_GROTH16_CIRCUIT_ID = 'deontic_discharge_v1' as const;
export type BrowserGroth16CircuitId = typeof DEFAULT_BROWSER_GROTH16_CIRCUIT_ID;

export type BrowserGroth16ArtifactRole = 'manifest' | 'r1cs' | 'wasm' | 'zkey' | 'verificationKey';

export interface BrowserGroth16ArtifactIntegrity {
  readonly bytes: number;
  readonly sha256: string;
  readonly sri: string;
}

export interface BrowserGroth16ArtifactDescriptor extends BrowserGroth16ArtifactIntegrity {
  readonly role: BrowserGroth16ArtifactRole;
  readonly fileName: string;
  readonly url: string;
}

export interface BrowserGroth16CircuitManifest {
  readonly schemaVersion: string;
  readonly circuitId: BrowserGroth16CircuitId;
  readonly proofSystem: 'groth16';
  readonly curve: 'bn128' | string;
  readonly compiler: string;
  readonly prover: string;
  readonly semanticClaim: string;
  readonly publicInputs: readonly string[];
  readonly privateInputs: readonly string[];
  readonly constraints: {
    readonly nonLinear: number;
    readonly linear: number;
    readonly wires: number;
  };
  readonly artifacts: Record<string, {
    readonly bytes: number;
    readonly sha256: string;
  }>;
}

export interface ResolvedBrowserGroth16Artifacts {
  readonly circuitId: BrowserGroth16CircuitId;
  readonly manifest: BrowserGroth16CircuitManifest;
  readonly manifestArtifact: BrowserGroth16ArtifactDescriptor;
  readonly r1cs: BrowserGroth16ArtifactDescriptor;
  readonly wasm: BrowserGroth16ArtifactDescriptor;
  readonly zkey: BrowserGroth16ArtifactDescriptor;
  readonly verificationKey: BrowserGroth16ArtifactDescriptor;
  readonly artifactDigest: string;
  readonly source: 'bundled' | 'base-url';
}

export interface BrowserGroth16ArtifactResolutionOptions {
  readonly circuitId?: BrowserGroth16CircuitId | string;
  /**
   * Optional public root for externally hosted artifacts. The resolver appends
   * `/groth16/<circuitId>/<fileName>` deterministically.
   */
  readonly artifactBaseUrl?: string;
}

export class BrowserZkpArtifactUnavailableError extends Error {
  readonly code: string = 'BROWSER_ZKP_ARTIFACT_UNAVAILABLE';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'BrowserZkpArtifactUnavailableError';
    if (options && 'cause' in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class BrowserZkpArtifactIntegrityError extends BrowserZkpArtifactUnavailableError {
  override readonly code = 'BROWSER_ZKP_ARTIFACT_INTEGRITY';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BrowserZkpArtifactIntegrityError';
  }
}

const DEONTIC_DISCHARGE_MANIFEST: BrowserGroth16CircuitManifest = Object.freeze({
  schemaVersion: '2026-07-06',
  circuitId: DEFAULT_BROWSER_GROTH16_CIRCUIT_ID,
  proofSystem: 'groth16',
  curve: 'bn128',
  compiler: 'circom2 2.2.3',
  prover: 'snarkjs 0.7.x',
  semanticClaim: 'expected_discharge = obligation AND permitted AND not_prohibited, with permitted and not_prohibited as private witness facts',
  publicInputs: Object.freeze(['obligation', 'expected_discharge']),
  privateInputs: Object.freeze(['permitted', 'not_prohibited']),
  constraints: Object.freeze({
    nonLinear: 6,
    linear: 0,
    wires: 6,
  }),
  artifacts: Object.freeze({
    'deontic_discharge_v1.r1cs': Object.freeze({
      bytes: 880,
      sha256: 'd8ca1aedbb1aa421bbf09584d91ef0813cc115647ee8c753adc6e352d1321c9f',
    }),
    'deontic_discharge_v1.wasm': Object.freeze({
      bytes: 34804,
      sha256: '0c3295889939f6f7dae5d9b380c4146e6464254fc33e173d1b199a154d113e5a',
    }),
    'deontic_discharge_v1_final.zkey': Object.freeze({
      bytes: 5079,
      sha256: '48a364014929366ed2088d97aed16823ab56a54820a3c67b335b563c3a78fccc',
    }),
    'verification_key.json': Object.freeze({
      bytes: 3108,
      sha256: '138fc4b9bd00602afe1b4db9d8c6a5a42391ee5e47bb1f2d212c67217e65368a',
    }),
  }),
});

const BUNDLED_DEONTIC_DISCHARGE_URLS = Object.freeze({
  manifest: new URL('./groth16/deontic_discharge_v1/manifest.json', import.meta.url).href,
  r1cs: new URL('./groth16/deontic_discharge_v1/deontic_discharge_v1.r1cs', import.meta.url).href,
  wasm: new URL('./groth16/deontic_discharge_v1/deontic_discharge_v1.wasm', import.meta.url).href,
  zkey: new URL('./groth16/deontic_discharge_v1/deontic_discharge_v1_final.zkey', import.meta.url).href,
  verificationKey: new URL('./groth16/deontic_discharge_v1/verification_key.json', import.meta.url).href,
});

const MANIFEST_FILE_NAME = 'manifest.json';
const R1CS_FILE_NAME = 'deontic_discharge_v1.r1cs';
const WASM_FILE_NAME = 'deontic_discharge_v1.wasm';
const ZKEY_FILE_NAME = 'deontic_discharge_v1_final.zkey';
const VERIFICATION_KEY_FILE_NAME = 'verification_key.json';

export function listBrowserGroth16CircuitIds(): BrowserGroth16CircuitId[] {
  return [DEFAULT_BROWSER_GROTH16_CIRCUIT_ID];
}

export function browserGroth16CircuitManifest(
  circuitId: BrowserGroth16CircuitId | string = DEFAULT_BROWSER_GROTH16_CIRCUIT_ID,
): BrowserGroth16CircuitManifest {
  if (circuitId !== DEFAULT_BROWSER_GROTH16_CIRCUIT_ID) {
    throw new BrowserZkpArtifactUnavailableError(
      `Browser Groth16 circuit "${circuitId}" is unavailable; available circuits: ${listBrowserGroth16CircuitIds().join(', ')}`,
    );
  }
  return DEONTIC_DISCHARGE_MANIFEST;
}

export function resolveBrowserGroth16Artifacts(
  options: BrowserGroth16ArtifactResolutionOptions = {},
): ResolvedBrowserGroth16Artifacts {
  const circuitId = options.circuitId ?? DEFAULT_BROWSER_GROTH16_CIRCUIT_ID;
  const manifest = browserGroth16CircuitManifest(circuitId);
  const source = options.artifactBaseUrl ? 'base-url' : 'bundled';
  const urls = options.artifactBaseUrl
    ? urlsFromBase(options.artifactBaseUrl, manifest.circuitId)
    : BUNDLED_DEONTIC_DISCHARGE_URLS;

  return Object.freeze({
    circuitId: manifest.circuitId,
    manifest,
    manifestArtifact: Object.freeze({
      role: 'manifest' as const,
      fileName: MANIFEST_FILE_NAME,
      url: urls.manifest,
      ...integrityForManifest(manifest),
    }),
    r1cs: descriptorFromManifest(manifest, 'r1cs', R1CS_FILE_NAME, urls.r1cs),
    wasm: descriptorFromManifest(manifest, 'wasm', WASM_FILE_NAME, urls.wasm),
    zkey: descriptorFromManifest(manifest, 'zkey', ZKEY_FILE_NAME, urls.zkey),
    verificationKey: descriptorFromManifest(manifest, 'verificationKey', VERIFICATION_KEY_FILE_NAME, urls.verificationKey),
    artifactDigest: sha256Hex(canonicalJson({
      circuitId: manifest.circuitId,
      proofSystem: manifest.proofSystem,
      curve: manifest.curve,
      publicInputs: manifest.publicInputs,
      privateInputs: manifest.privateInputs,
      artifacts: manifest.artifacts,
    })),
    source,
  });
}

export async function verifyBrowserGroth16ArtifactBytes(
  artifact: BrowserGroth16ArtifactDescriptor,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength !== artifact.bytes) {
    throw new BrowserZkpArtifactIntegrityError(
      `Browser ZKP artifact ${artifact.fileName} has ${bytes.byteLength} bytes; expected ${artifact.bytes}`,
    );
  }
  const actual = sha256Hex(bytes);
  if (actual !== artifact.sha256) {
    throw new BrowserZkpArtifactIntegrityError(
      `Browser ZKP artifact ${artifact.fileName} sha256 mismatch: expected ${artifact.sha256}, received ${actual}`,
    );
  }
}

function descriptorFromManifest(
  manifest: BrowserGroth16CircuitManifest,
  role: BrowserGroth16ArtifactRole,
  fileName: string,
  url: string,
): BrowserGroth16ArtifactDescriptor {
  const integrity = manifest.artifacts[fileName];
  if (!integrity) {
    throw new BrowserZkpArtifactIntegrityError(`Browser Groth16 manifest is missing ${fileName}`);
  }
  return Object.freeze({
    role,
    fileName,
    url,
    bytes: integrity.bytes,
    sha256: integrity.sha256,
    sri: sha256Sri(integrity.sha256),
  });
}

function integrityForManifest(manifest: BrowserGroth16CircuitManifest): BrowserGroth16ArtifactIntegrity {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const sha256 = sha256Hex(bytes);
  return Object.freeze({
    bytes: bytes.byteLength,
    sha256,
    sri: sha256Sri(sha256),
  });
}

function urlsFromBase(baseUrl: string, circuitId: BrowserGroth16CircuitId): typeof BUNDLED_DEONTIC_DISCHARGE_URLS {
  const root = baseUrl.replace(/\/+$/, '');
  const prefix = `${root}/groth16/${circuitId}`;
  return Object.freeze({
    manifest: `${prefix}/${MANIFEST_FILE_NAME}`,
    r1cs: `${prefix}/${R1CS_FILE_NAME}`,
    wasm: `${prefix}/${WASM_FILE_NAME}`,
    zkey: `${prefix}/${ZKEY_FILE_NAME}`,
    verificationKey: `${prefix}/${VERIFICATION_KEY_FILE_NAME}`,
  });
}

function sha256Sri(hex: string): string {
  return `sha256-${base64FromBytes(hexToBytes(hex))}`;
}

function hexToBytes(input: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(input)) {
    throw new BrowserZkpArtifactIntegrityError(`Invalid sha256 hex digest: ${input}`);
  }
  const out = new Uint8Array(input.length / 2);
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(input.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    out += alphabet[a >> 2];
    out += alphabet[((a & 0x03) << 4) | (b >> 4)];
    out += hasB ? alphabet[((b & 0x0f) << 2) | (c >> 6)] : '=';
    out += hasC ? alphabet[c & 0x3f] : '=';
  }
  return out;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
