/**
 * Browser-native Schnorr/Fiat-Shamir ZKP backend.
 *
 * This is a real non-interactive proof of knowledge of a private scalar bound
 * to a statement and public inputs. It does not claim Groth16 circuit semantics;
 * Groth16/ProveKit remain separate host-native adapters.
 */

import { base64Encode, bytesToHex, hexToBytes, sha256Hex, utf8Bytes } from '../shared/browser-crypto.js';

const MODP_2048_P_HEX = [
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1',
  '29024E088A67CC74020BBEA63B139B22514A08798E3404DD',
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245',
  'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED',
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D',
  'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F',
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D',
  '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B',
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9',
  'DE2BCBF6955817183995497CEA956AE515D2261898FA0510',
  '15728E5A8AACAA68FFFFFFFFFFFFFFFF',
].join('');

const MODP_2048_P = BigInt(`0x${MODP_2048_P_HEX}`);
const MODP_2048_Q = (MODP_2048_P - 1n) / 2n;
const MODP_2048_G = 4n;

export const BROWSER_SCHNORR_BACKEND_ID = 'browser-schnorr-wasm' as const;
export const BROWSER_SCHNORR_VERIFIER_ID = 'browser-schnorr-zkp-v0.1' as const;
export const BROWSER_SCHNORR_WASM_ARTIFACT = 'src/services/zkp/artifacts/schnorr-field.wasm.b64';
export const BROWSER_SCHNORR_WASM_BASE64 = 'AGFzbQEAAAABCAFgA39/fwF/AwIBAAcLAQdhZGRfbW9kAAAKDAEKACAAIAFqIAJwCw==';

const BROWSER_SCHNORR_WASM_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x01, 0x60,
  0x03, 0x7f, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0b,
  0x01, 0x07, 0x61, 0x64, 0x64, 0x5f, 0x6d, 0x6f, 0x64, 0x00, 0x00, 0x0a,
  0x0c, 0x01, 0x0a, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x20, 0x02, 0x70,
  0x0b,
]);

export interface BrowserSchnorrWitness {
  readonly statement?: string;
  readonly formula?: string;
  readonly theorem?: string;
  readonly publicInputs?: Record<string, unknown> | unknown[];
  readonly privateWitness?: unknown;
  readonly secret?: string | number;
  readonly witness?: unknown;
}

export interface BrowserSchnorrProofPayload {
  readonly schema: 'browser-schnorr-zkp-v1';
  readonly proofSystem: 'schnorr-fiat-shamir';
  readonly backend: typeof BROWSER_SCHNORR_BACKEND_ID;
  readonly verifierId: typeof BROWSER_SCHNORR_VERIFIER_ID;
  readonly group: 'rfc3526-modp-2048';
  readonly generator: string;
  readonly statement: string;
  readonly publicInputs: Record<string, unknown>;
  readonly publicKey: string;
  readonly commitment: string;
  readonly challenge: string;
  readonly response: string;
  readonly transcriptHash: string;
  readonly witnessDigest: string;
  readonly wasmArtifact: string;
  readonly wasmArtifactSha256: string;
  readonly createdAt: string;
}

export interface BrowserSchnorrBackendStats {
  proofsGenerated: number;
  proofsVerified: number;
  failures: number;
  wasmLoads: number;
}

export class BrowserSchnorrProof {
  constructor(
    public readonly proofData: Uint8Array,
    public readonly publicInputs: Record<string, unknown>,
    public readonly metadata: Record<string, unknown>,
    public readonly timestamp: number,
    public readonly sizeBytes: number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      proofData: bytesToHex(this.proofData),
      proof_b64: base64Encode(this.proofData),
      proof_hash: sha256Hex(this.proofData),
      is_proved: this.proofData.length > 0,
      publicInputs: this.publicInputs,
      metadata: this.metadata,
      timestamp: this.timestamp,
      sizeBytes: this.sizeBytes,
    };
  }

  payload(): BrowserSchnorrProofPayload {
    return parseProofPayload(bytesToString(this.proofData));
  }
}

export class BrowserSchnorrZkpBackend {
  private readonly stats: BrowserSchnorrBackendStats = {
    proofsGenerated: 0,
    proofsVerified: 0,
    failures: 0,
    wasmLoads: 0,
  };
  private wasmPromise: Promise<BrowserSchnorrWasmExports> | null = null;

  isAvailable(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  async generateProof(witnessJson: string, seed?: number): Promise<BrowserSchnorrProof> {
    this.stats.proofsGenerated++;
    try {
      await this.ensureWasm();
      const witness = parseWitness(witnessJson);
      const canonicalWitness = canonicalJson(witness);
      const statement = statementFromWitness(witness, canonicalWitness);
      const publicInputs = publicInputsFromWitness(witness, canonicalWitness);
      const secretMaterial = secretMaterialFromWitness(witness, canonicalWitness);
      const x = scalarFromHash(`secret:${secretMaterial}`);
      const y = modPow(MODP_2048_G, x, MODP_2048_P);
      const r = scalarFromHash(`nonce:${seed ?? 'default'}:${secretMaterial}:${statement}:${canonicalJson(publicInputs)}`);
      const t = modPow(MODP_2048_G, r, MODP_2048_P);
      const challengeInput = canonicalJson({
        schema: 'browser-schnorr-zkp-v1',
        proofSystem: 'schnorr-fiat-shamir',
        group: 'rfc3526-modp-2048',
        generator: bigIntToHex(MODP_2048_G),
        statement,
        publicInputs,
        publicKey: bigIntToHex(y),
        commitment: bigIntToHex(t),
      });
      const e = scalarFromHash(`challenge:${challengeInput}`);
      const s = (r + e * x) % MODP_2048_Q;
      const transcriptHash = sha256Hex(challengeInput);
      const payload: BrowserSchnorrProofPayload = {
        schema: 'browser-schnorr-zkp-v1',
        proofSystem: 'schnorr-fiat-shamir',
        backend: BROWSER_SCHNORR_BACKEND_ID,
        verifierId: BROWSER_SCHNORR_VERIFIER_ID,
        group: 'rfc3526-modp-2048',
        generator: bigIntToHex(MODP_2048_G),
        statement,
        publicInputs,
        publicKey: bigIntToHex(y),
        commitment: bigIntToHex(t),
        challenge: bigIntToHex(e),
        response: bigIntToHex(s),
        transcriptHash,
        witnessDigest: sha256Hex(canonicalWitness),
        wasmArtifact: BROWSER_SCHNORR_WASM_ARTIFACT,
        wasmArtifactSha256: sha256Hex(BROWSER_SCHNORR_WASM_BYTES),
        createdAt: new Date(0).toISOString(),
      };
      const proofData = utf8Bytes(canonicalJson(payload));
      return new BrowserSchnorrProof(
        proofData,
        {
          ...publicInputs,
          statement,
          publicKey: payload.publicKey,
          witnessDigest: payload.witnessDigest,
        },
        {
          backend: BROWSER_SCHNORR_BACKEND_ID,
          verifier_id: BROWSER_SCHNORR_VERIFIER_ID,
          proof_system: payload.proofSystem,
          wasm_artifact: payload.wasmArtifact,
          wasm_artifact_sha256: payload.wasmArtifactSha256,
        },
        Date.now(),
        proofData.length,
      );
    } catch (error) {
      this.stats.failures++;
      throw error;
    }
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    this.stats.proofsVerified++;
    try {
      await this.ensureWasm();
      const payload = parseProofEnvelope(proofJson);
      if (payload.backend !== BROWSER_SCHNORR_BACKEND_ID) return false;
      if (payload.verifierId !== BROWSER_SCHNORR_VERIFIER_ID) return false;
      if (payload.group !== 'rfc3526-modp-2048') return false;
      if (payload.generator !== bigIntToHex(MODP_2048_G)) return false;
      if (payload.wasmArtifactSha256 !== sha256Hex(BROWSER_SCHNORR_WASM_BYTES)) return false;
      const publicKey = parseGroupElement(payload.publicKey);
      const commitment = parseGroupElement(payload.commitment);
      const challenge = parseScalar(payload.challenge);
      const response = parseScalar(payload.response);
      const challengeInput = canonicalJson({
        schema: payload.schema,
        proofSystem: payload.proofSystem,
        group: payload.group,
        generator: payload.generator,
        statement: payload.statement,
        publicInputs: payload.publicInputs,
        publicKey: payload.publicKey,
        commitment: payload.commitment,
      });
      const expectedChallenge = scalarFromHash(`challenge:${challengeInput}`);
      if (challenge !== expectedChallenge) return false;
      if (payload.transcriptHash !== sha256Hex(challengeInput)) return false;
      const left = modPow(MODP_2048_G, response, MODP_2048_P);
      const right = (commitment * modPow(publicKey, challenge, MODP_2048_P)) % MODP_2048_P;
      return left === right;
    } catch {
      this.stats.failures++;
      return false;
    }
  }

  getStats(): Readonly<BrowserSchnorrBackendStats> {
    return { ...this.stats };
  }

  private async ensureWasm(): Promise<BrowserSchnorrWasmExports> {
    if (!this.isAvailable()) throw new Error('WebAssembly is not available in this runtime');
    if (!this.wasmPromise) {
      this.wasmPromise = instantiateSchnorrWasmHelper().then(exports => {
        this.stats.wasmLoads++;
        return exports;
      });
    }
    const exports = await this.wasmPromise;
    if (exports.add_mod(7, 8, 10) !== 5) {
      throw new Error('Schnorr WASM arithmetic helper failed its self-test');
    }
    return exports;
  }
}

export interface BrowserSchnorrWasmExports {
  add_mod(a: number, b: number, modulus: number): number;
}

export async function instantiateSchnorrWasmHelper(): Promise<BrowserSchnorrWasmExports> {
  const result = await WebAssembly.instantiate(BROWSER_SCHNORR_WASM_BYTES);
  return result.instance.exports as unknown as BrowserSchnorrWasmExports;
}

export function browserSchnorrProofFromDict(data: Record<string, unknown>): BrowserSchnorrProof {
  const proofData = typeof data['proofData'] === 'string'
    ? hexToBytes(data['proofData'])
    : utf8Bytes(canonicalJson(data));
  return new BrowserSchnorrProof(
    proofData,
    (data['publicInputs'] as Record<string, unknown>) ?? {},
    (data['metadata'] as Record<string, unknown>) ?? {},
    Number(data['timestamp'] ?? Date.now()),
    Number(data['sizeBytes'] ?? proofData.length),
  );
}

function parseWitness(input: string): BrowserSchnorrWitness {
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { witness: parsed };
  }
  return parsed as BrowserSchnorrWitness;
}

function parseProofEnvelope(input: string): BrowserSchnorrProofPayload {
  const parsed = JSON.parse(input) as Record<string, unknown>;
  if (typeof parsed['proofData'] === 'string') {
    return parseProofPayload(bytesToString(hexToBytes(parsed['proofData'])));
  }
  return parseProofPayload(canonicalJson(parsed));
}

function parseProofPayload(input: string): BrowserSchnorrProofPayload {
  const parsed = JSON.parse(input) as BrowserSchnorrProofPayload;
  if (parsed.schema !== 'browser-schnorr-zkp-v1') {
    throw new Error('unsupported browser Schnorr proof schema');
  }
  return parsed;
}

function statementFromWitness(witness: BrowserSchnorrWitness, canonicalWitness: string): string {
  const direct = witness.statement ?? witness.formula ?? witness.theorem;
  return typeof direct === 'string' && direct.trim() ? direct : `witness:${sha256Hex(canonicalWitness)}`;
}

function publicInputsFromWitness(
  witness: BrowserSchnorrWitness,
  canonicalWitness: string,
): Record<string, unknown> {
  const raw = witness.publicInputs;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>), witnessDigest: sha256Hex(canonicalWitness) };
  }
  if (Array.isArray(raw)) {
    return { values: raw, witnessDigest: sha256Hex(canonicalWitness) };
  }
  return { witnessDigest: sha256Hex(canonicalWitness) };
}

function secretMaterialFromWitness(witness: BrowserSchnorrWitness, canonicalWitness: string): string {
  if (witness.secret !== undefined) return String(witness.secret);
  if (witness.privateWitness !== undefined) return canonicalJson(witness.privateWitness);
  if (witness.witness !== undefined) return canonicalJson(witness.witness);
  return canonicalWitness;
}

function scalarFromHash(input: string): bigint {
  const value = BigInt(`0x${sha256Hex(input)}`);
  const scalar = value % MODP_2048_Q;
  return scalar === 0n ? 1n : scalar;
}

function parseScalar(input: string): bigint {
  const value = BigInt(`0x${input}`);
  if (value <= 0n || value >= MODP_2048_Q) throw new Error('scalar outside group order');
  return value;
}

function parseGroupElement(input: string): bigint {
  const value = BigInt(`0x${input}`);
  if (value <= 1n || value >= MODP_2048_P - 1n) throw new Error('group element outside field');
  return value;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

function bigIntToHex(value: bigint): string {
  return value.toString(16);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

function bytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
}
