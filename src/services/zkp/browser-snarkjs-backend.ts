<<<<<<< HEAD
import { sha256Hex } from '../shared/browser-crypto.js';
=======
import { sha256Hex } from '../provers/browser-crypto.js';
import {
  DEFAULT_BROWSER_GROTH16_CIRCUIT_ID,
  BrowserZkpArtifactUnavailableError,
  resolveBrowserGroth16Artifacts,
  verifyBrowserGroth16ArtifactBytes,
  type BrowserGroth16ArtifactDescriptor,
  type BrowserGroth16CircuitId,
  type ResolvedBrowserGroth16Artifacts,
} from './artifacts/index.js';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

export interface ZKPBackendProtocol {
  generateProof(witnessJson: string, seed?: number): Promise<BrowserSnarkjsProof>;
  verifyProof(proofJson: string): Promise<boolean>;
}

export const BROWSER_SNARKJS_GROTH16_BACKEND_ID = 'snarkjs-browser-groth16' as const;
export const BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID = 'snarkjs-browser' as const;

export interface BrowserSnarkjsBackendOptions {
  backend?: typeof BROWSER_SNARKJS_GROTH16_BACKEND_ID | typeof BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID | string;
  circuitId?: BrowserGroth16CircuitId | string;
  artifactBaseUrl?: string;
  wasmPath?: string;
  zkeyPath?: string;
  verificationKeyPath?: string;
  verificationKey?: Record<string, unknown>;
  artifactIntegrity?: 'strict' | 'metadata-only' | 'off';
  fetch?: typeof fetch;
  snarkjs?: SnarkJsModule | (() => Promise<SnarkJsModule>);
}

export interface SnarkJsModule {
  groth16: {
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

interface CustomBrowserGroth16Artifacts {
  readonly wasmPath: string;
  readonly zkeyPath: string;
  readonly verificationKeyPath: string;
  readonly artifactDigest: string;
}

export class BrowserSnarkjsProof {
  constructor(
    public readonly proofData: Uint8Array,
    public readonly publicInputs: Record<string, unknown>,
    public readonly metadata: Record<string, unknown>,
    public readonly timestamp: number,
    public readonly sizeBytes: number,
    public readonly proof?: unknown,
    public readonly publicSignals?: unknown,
  ) {}

  toDict(): Record<string, unknown> {
    const proofData = bytesToHex(this.proofData);
    return {
      proofData,
      proof_hash: sha256Hex(this.proofData),
      is_proved: this.proofData.length > 0,
      publicInputs: this.publicInputs,
      metadata: this.metadata,
      timestamp: this.timestamp,
      sizeBytes: this.sizeBytes,
      proof: this.proof,
      publicSignals: this.publicSignals,
    };
  }
}

const DEFAULT_BROWSER_ZKP_WASM_PATH = '/assets/zkp/groth16/circuit.wasm';
const DEFAULT_BROWSER_ZKP_ZKEY_PATH = '/assets/zkp/groth16/circuit_final.zkey';
const DEFAULT_BROWSER_ZKP_VK_PATH = '/assets/zkp/groth16/verification_key.json';

export class BrowserSnarkjsGroth16Backend implements ZKPBackendProtocol {
  private readonly wasmPath: string;
  private readonly zkeyPath: string;
  private readonly verificationKeyPath: string;
  private readonly artifacts?: ResolvedBrowserGroth16Artifacts;
  private readonly customArtifacts?: CustomBrowserGroth16Artifacts;
  private readonly artifactIntegrity: 'strict' | 'metadata-only' | 'off';
  private readonly fetchImpl?: typeof fetch;
  private readonly snarkjsLoader?: SnarkJsModule | (() => Promise<SnarkJsModule>);
  private snarkjs?: SnarkJsModule;
  private verificationKey?: Record<string, unknown>;
  private readonly verifiedArtifacts = new Set<string>();

  constructor(options: BrowserSnarkjsBackendOptions = {}) {
    assertProductionBrowserZkpBackend(options.backend ?? BROWSER_SNARKJS_GROTH16_BACKEND_ID);
    const hasLegacyPaths = options.wasmPath !== undefined
      || options.zkeyPath !== undefined
      || options.verificationKeyPath !== undefined;
    this.artifactIntegrity = options.artifactIntegrity ?? (hasLegacyPaths ? 'metadata-only' : 'strict');
    this.fetchImpl = options.fetch;
    this.snarkjsLoader = options.snarkjs;
    this.verificationKey = options.verificationKey;

    if (hasLegacyPaths) {
      this.wasmPath = String(options.wasmPath ?? DEFAULT_BROWSER_ZKP_WASM_PATH);
      this.zkeyPath = String(options.zkeyPath ?? DEFAULT_BROWSER_ZKP_ZKEY_PATH);
      this.verificationKeyPath = String(options.verificationKeyPath ?? DEFAULT_BROWSER_ZKP_VK_PATH);
      this.customArtifacts = {
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
        verificationKeyPath: this.verificationKeyPath,
        artifactDigest: sha256Hex(canonicalJson({
          wasmPath: this.wasmPath,
          zkeyPath: this.zkeyPath,
          verificationKeyPath: this.verificationKeyPath,
        })),
      };
    } else {
      this.artifacts = resolveBrowserGroth16Artifacts({
        circuitId: options.circuitId ?? DEFAULT_BROWSER_GROTH16_CIRCUIT_ID,
        artifactBaseUrl: options.artifactBaseUrl,
      });
      this.wasmPath = this.artifacts.wasm.url;
      this.zkeyPath = this.artifacts.zkey.url;
      this.verificationKeyPath = this.artifacts.verificationKey.url;
    }
  }

  async generateProof(witnessJson: string): Promise<BrowserSnarkjsProof> {
    await this.assertAvailable();
    await this.verifyArtifactIntegrity('wasm');
    await this.verifyArtifactIntegrity('zkey');
    const snarkjs = await this.loadSnarkjs();
    const witness = parseWitness(witnessJson);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, this.wasmPath, this.zkeyPath);
    const proofJson = JSON.stringify({ proof, publicSignals });
    const proofBytes = new TextEncoder().encode(proofJson);
    return new BrowserSnarkjsProof(
      proofBytes,
      { publicSignals },
      {
        backend: BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID,
        backend_id: BROWSER_SNARKJS_GROTH16_BACKEND_ID,
        circuitId: this.artifacts?.circuitId ?? 'custom',
        proofSystem: 'groth16',
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
        verificationKeyPath: this.verificationKeyPath,
        artifactDigest: this.artifactDigest(),
        artifactIntegrity: this.artifactIntegrityMetadata(),
      },
      Date.now(),
      proofBytes.length,
      proof,
      publicSignals,
    );
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    await this.assertAvailable();
    const snarkjs = await this.loadSnarkjs();
    const parsed = normalizeProofEnvelope(JSON.parse(proofJson) as Record<string, unknown>);
    const publicSignals = parsed.publicSignals ?? parsed.public_inputs ?? parsed.inputs;
    const proof = parsed.proof ?? parsed.pi_a ?? parsed.proofData;
    if (!publicSignals || !proof) return false;
    const vk = await this.loadVerificationKey();
    return snarkjs.groth16.verify(vk, publicSignals, proof);
  }

  artifactDigest(): string {
    return this.artifacts?.artifactDigest
      ?? this.customArtifacts?.artifactDigest
      ?? sha256Hex(canonicalJson({
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
        verificationKeyPath: this.verificationKeyPath,
      }));
  }

  artifactManifest(): ResolvedBrowserGroth16Artifacts | undefined {
    return this.artifacts;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.assertAvailable();
      return true;
    } catch {
      return false;
    }
  }

  async assertAvailable(): Promise<void> {
    if (typeof WebAssembly === 'undefined') {
      throw new BrowserZkpArtifactUnavailableError('Browser Groth16 backend is unavailable: WebAssembly is not available');
    }
    await this.loadSnarkjs();
  }

  private async loadSnarkjs(): Promise<SnarkJsModule> {
    if (this.snarkjs) return this.snarkjs;
    let candidate: SnarkJsModule;
    try {
      if (typeof this.snarkjsLoader === 'function') {
        candidate = await this.snarkjsLoader();
      } else if (this.snarkjsLoader) {
        candidate = this.snarkjsLoader;
      } else {
        const module = await import('snarkjs');
        candidate = module as unknown as SnarkJsModule;
      }
    } catch (cause) {
      throw new BrowserZkpArtifactUnavailableError('Browser Groth16 backend is unavailable: snarkjs could not be loaded', { cause });
    }
    if (!candidate?.groth16?.fullProve || !candidate?.groth16?.verify) {
      throw new BrowserZkpArtifactUnavailableError('Browser Groth16 backend is unavailable: snarkjs groth16 API is missing');
    }
    this.snarkjs = candidate;
    return candidate;
  }

  private async loadVerificationKey(): Promise<Record<string, unknown>> {
    if (this.verificationKey) return this.verificationKey;
    const bytes = await this.fetchArtifactBytes(
      this.artifacts?.verificationKey ?? descriptorForCustomPath('verificationKey', 'verification_key.json', this.verificationKeyPath),
    );
    const payload = JSON.parse(bytesToString(bytes)) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid verification key payload');
    }
    this.verificationKey = payload as Record<string, unknown>;
    return this.verificationKey;
  }

  private artifactIntegrityMetadata(): Record<string, unknown> {
    if (!this.artifacts) {
      return {
        mode: this.artifactIntegrity,
        artifactDigest: this.artifactDigest(),
      };
    }
    return {
      mode: this.artifactIntegrity,
      wasm: pickIntegrity(this.artifacts.wasm),
      zkey: pickIntegrity(this.artifacts.zkey),
      verificationKey: pickIntegrity(this.artifacts.verificationKey),
    };
  }

  private async verifyArtifactIntegrity(role: 'wasm' | 'zkey' | 'verificationKey'): Promise<void> {
    if (this.artifactIntegrity === 'off') return;
    const artifact = this.artifacts?.[role];
    if (!artifact) return;
    if (this.verifiedArtifacts.has(artifact.url)) return;
    if (this.artifactIntegrity === 'metadata-only') {
      this.verifiedArtifacts.add(artifact.url);
      return;
    }
    await this.fetchArtifactBytes(artifact);
  }

  private async fetchArtifactBytes(artifact: BrowserGroth16ArtifactDescriptor): Promise<Uint8Array> {
    const response = await this.fetchRaw(artifact.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (this.artifacts && this.artifactIntegrity === 'strict') {
      await verifyBrowserGroth16ArtifactBytes(artifact, bytes);
    }
    this.verifiedArtifacts.add(artifact.url);
    return bytes;
  }

  private async fetchRaw(url: string): Promise<Response> {
    const fetcher = this.fetchImpl ?? globalThis.fetch;
    if (typeof fetcher !== 'function') {
      throw new BrowserZkpArtifactUnavailableError(`Browser ZKP artifact fetch is unavailable for ${url}`);
    }
    let response: Response;
    try {
      response = await fetcher(url);
    } catch (cause) {
      throw new BrowserZkpArtifactUnavailableError(`Failed to load browser ZKP artifact ${url}`, { cause });
    }
    if (!response.ok) {
      throw new BrowserZkpArtifactUnavailableError(`Failed to load browser ZKP artifact ${url}: HTTP ${response.status}`);
    }
    return response;
  }
}

export function createBrowserZkpProductionBackend(
  backend: string = BROWSER_SNARKJS_GROTH16_BACKEND_ID,
  options: BrowserSnarkjsBackendOptions = {},
): BrowserSnarkjsGroth16Backend {
  assertProductionBrowserZkpBackend(backend);
  return new BrowserSnarkjsGroth16Backend({ ...options, backend });
}

export function assertProductionBrowserZkpBackend(backend: string): void {
  if (backend === 'simulated'
      || backend === 'simulated-zkp'
      || backend === 'simulated-zkp-v0.1'
      || backend === 'test-only-simulated-zkp') {
    throw new BrowserZkpArtifactUnavailableError(
      `Browser production ZKP backend "${backend}" is unavailable; simulated ZKP helpers are test-only`,
    );
  }
  if (backend !== BROWSER_SNARKJS_GROTH16_BACKEND_ID && backend !== BROWSER_SNARKJS_GROTH16_LEGACY_BACKEND_ID) {
    throw new BrowserZkpArtifactUnavailableError(
      `Browser production ZKP backend "${backend}" is unavailable; use ${BROWSER_SNARKJS_GROTH16_BACKEND_ID}`,
    );
  }
}

function bytesToHex(input: Uint8Array): string {
  let out = '';
  for (const byte of input) out += byte.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(input: string): Uint8Array {
  const clean = input.startsWith('0x') ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('invalid hex proof data');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToString(input: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(input);
  return Array.from(input, byte => String.fromCharCode(byte)).join('');
}

function normalizeProofEnvelope(parsed: Record<string, unknown>): Record<string, unknown> {
  if (parsed.proof && parsed.publicSignals) return parsed;
  if (typeof parsed.proofData === 'string') {
    try {
      const decoded = JSON.parse(bytesToString(hexToBytes(parsed.proofData))) as Record<string, unknown>;
      return { ...decoded, ...parsed };
    } catch {
      return parsed;
    }
  }
  return parsed;
}

function parseWitness(witnessJson: string): Record<string, unknown> {
  const parsed = JSON.parse(witnessJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Witness payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function pickIntegrity(artifact: BrowserGroth16ArtifactDescriptor): Record<string, unknown> {
  return {
    fileName: artifact.fileName,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    sri: artifact.sri,
  };
}

function descriptorForCustomPath(
  role: BrowserGroth16ArtifactDescriptor['role'],
  fileName: string,
  url: string,
): BrowserGroth16ArtifactDescriptor {
  return {
    role,
    fileName,
    url,
    bytes: 0,
    sha256: '',
    sri: '',
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
