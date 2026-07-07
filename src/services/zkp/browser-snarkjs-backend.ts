import { sha256Hex } from '../shared/browser-crypto.js';

export interface ZKPBackendProtocol {
  generateProof(witnessJson: string, seed?: number): Promise<BrowserSnarkjsProof>;
  verifyProof(proofJson: string): Promise<boolean>;
}

export interface BrowserSnarkjsBackendOptions {
  wasmPath?: string;
  zkeyPath?: string;
  verificationKeyPath?: string;
  verificationKey?: Record<string, unknown>;
}

interface SnarkJsModule {
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
  private snarkjs?: SnarkJsModule;
  private verificationKey?: Record<string, unknown>;

  constructor(options: BrowserSnarkjsBackendOptions = {}) {
    this.wasmPath = String(options.wasmPath ?? DEFAULT_BROWSER_ZKP_WASM_PATH);
    this.zkeyPath = String(options.zkeyPath ?? DEFAULT_BROWSER_ZKP_ZKEY_PATH);
    this.verificationKeyPath = String(options.verificationKeyPath ?? DEFAULT_BROWSER_ZKP_VK_PATH);
    this.verificationKey = options.verificationKey;
  }

  async generateProof(witnessJson: string): Promise<BrowserSnarkjsProof> {
    const snarkjs = await this.loadSnarkjs();
    const witness = parseWitness(witnessJson);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, this.wasmPath, this.zkeyPath);
    const proofJson = JSON.stringify({ proof, publicSignals });
    const proofBytes = new TextEncoder().encode(proofJson);
    return new BrowserSnarkjsProof(
      proofBytes,
      { publicSignals },
      {
        backend: 'snarkjs-browser',
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
        verificationKeyPath: this.verificationKeyPath,
      },
      Date.now(),
      proofBytes.length,
      proof,
      publicSignals,
    );
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    const snarkjs = await this.loadSnarkjs();
    const parsed = normalizeProofEnvelope(JSON.parse(proofJson) as Record<string, unknown>);
    const publicSignals = parsed.publicSignals ?? parsed.public_inputs ?? parsed.inputs;
    const proof = parsed.proof ?? parsed.pi_a ?? parsed.proofData;
    if (!publicSignals || !proof) return false;
    const vk = await this.loadVerificationKey();
    return snarkjs.groth16.verify(vk, publicSignals, proof);
  }

  artifactDigest(): string {
    return sha256Hex(`${this.wasmPath}|${this.zkeyPath}|${this.verificationKeyPath}`);
  }

  private async loadSnarkjs(): Promise<SnarkJsModule> {
    if (this.snarkjs) return this.snarkjs;
    const module = await import('snarkjs');
    const candidate = (module as unknown as SnarkJsModule);
    if (!candidate?.groth16?.fullProve || !candidate?.groth16?.verify) {
      throw new Error('snarkjs groth16 backend is unavailable');
    }
    this.snarkjs = candidate;
    return candidate;
  }

  private async loadVerificationKey(): Promise<Record<string, unknown>> {
    if (this.verificationKey) return this.verificationKey;
    const response = await fetch(this.verificationKeyPath);
    if (!response.ok) {
      throw new Error(`Failed to load verification key: ${this.verificationKeyPath}`);
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid verification key payload');
    }
    this.verificationKey = payload as Record<string, unknown>;
    return this.verificationKey;
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
