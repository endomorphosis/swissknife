import { sha256Hex } from '../provers/browser-crypto.js';
import { Groth16Proof, type ZKPBackendProtocol } from '../zkp-backends.js';

export interface BrowserSnarkjsBackendOptions {
  wasmPath?: string;
  zkeyPath?: string;
  verificationKeyPath?: string;
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
  }

  async generateProof(witnessJson: string): Promise<Groth16Proof> {
    const snarkjs = await this.loadSnarkjs();
    const witness = parseWitness(witnessJson);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, this.wasmPath, this.zkeyPath);
    const proofJson = JSON.stringify({ proof, publicSignals });
    const proofBytes = new TextEncoder().encode(proofJson);
    return new Groth16Proof(
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
    );
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    const snarkjs = await this.loadSnarkjs();
    const parsed = JSON.parse(proofJson) as Record<string, unknown>;
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

function parseWitness(witnessJson: string): Record<string, unknown> {
  const parsed = JSON.parse(witnessJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Witness payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

