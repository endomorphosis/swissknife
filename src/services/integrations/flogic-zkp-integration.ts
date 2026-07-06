/**
 * F-logic ZKP Integration — PORT-190 (Sprint 92)
 *
 * Standalone frame-logic to circuit witness transpilation plus proof generation
 * and verification helpers. Uses an injectable ZKP backend so tests and local
 * development do not require native prover binaries.
 */

import { sha256Hex } from './provers/browser-crypto.js';

export interface ZKPProofLike {
  toDict(): Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

export interface ZKPBackendProtocol {
  generateProof(witnessJson: string, seed?: number): Promise<ZKPProofLike>;
  verifyProof(proofJson: string): Promise<boolean>;
}

class MissingZKPBackend implements ZKPBackendProtocol {
  async generateProof(): Promise<ZKPProofLike> {
    throw new Error('Groth16 native backend unavailable. Inject a browser/WASM backend or set allowSimulatedFallback:true only in explicit tests.');
  }

  async verifyProof(): Promise<boolean> {
    return false;
  }
}

export interface FLogicFrameFact {
  subject: string;
  slot: string;
  value: string;
}

export interface FLogicCircuit {
  circuitId: string;
  version: number;
  facts: FLogicFrameFact[];
  query: string;
  publicInputs: Record<string, unknown>;
  witness: Record<string, unknown>;
}

export interface FLogicZKPResult {
  proved: boolean;
  circuit: FLogicCircuit;
  proof: Record<string, unknown>;
  proofHash: string;
  publicInputs: Record<string, unknown>;
  backend: string;
  elapsedMs: number;
}

export interface FLogicZKPStats {
  proofsGenerated: number;
  proofsVerified: number;
  failures: number;
}

export class FLogicCircuitTranspiler {
  transpile(frames: string | FLogicFrameFact[], query: string, opts: { circuitId?: string; version?: number } = {}): FLogicCircuit {
    const facts = typeof frames === 'string' ? parseFLogicFacts(frames) : frames.map(normalizeFact);
    const canonicalFacts = facts.sort((a, b) => canonicalFact(a).localeCompare(canonicalFact(b)));
    const factsCommitment = sha256(canonicalFacts.map(canonicalFact).join('\n'));
    const queryHash = sha256(query.trim());
    return {
      circuitId: opts.circuitId ?? 'flogic_frame_query',
      version: opts.version ?? 1,
      facts: canonicalFacts,
      query: query.trim(),
      publicInputs: {
        circuit_id: opts.circuitId ?? 'flogic_frame_query',
        circuit_version: opts.version ?? 1,
        facts_commitment: factsCommitment,
        query_hash: queryHash,
      },
      witness: {
        facts: canonicalFacts,
        query: query.trim(),
        satisfied: evaluateQuery(canonicalFacts, query),
      },
    };
  }
}

export class FLogicZKPIntegration {
  private readonly stats: FLogicZKPStats = { proofsGenerated: 0, proofsVerified: 0, failures: 0 };
  private readonly transpiler = new FLogicCircuitTranspiler();

  constructor(private readonly backend: ZKPBackendProtocol = new MissingZKPBackend()) {}

  async proveWithZkp(frames: string | FLogicFrameFact[], query: string): Promise<FLogicZKPResult> {
    const started = performance.now();
    const circuit = this.transpiler.transpile(frames, query);
    try {
      const proof = await this.backend.generateProof(JSON.stringify(circuit.witness));
      this.stats.proofsGenerated++;
      const proofDict = proof.toDict();
      const proofHash = sha256(JSON.stringify(proofDict));
      return {
        proved: Boolean(circuit.witness.satisfied),
        circuit,
        proof: proofDict,
        proofHash,
        publicInputs: { ...circuit.publicInputs, proof_hash: proofHash },
        backend: String(proof.metadata['backend'] ?? 'unknown'),
        elapsedMs: performance.now() - started,
      };
    } catch (err) {
      this.stats.failures++;
      throw err;
    }
  }

  async verifyProof(result: FLogicZKPResult | { proof: Record<string, unknown>; publicInputs?: Record<string, unknown> }): Promise<boolean> {
    this.stats.proofsVerified++;
    const proofJson = JSON.stringify(result.proof);
    return this.backend.verifyProof(proofJson);
  }

  getStats(): Readonly<FLogicZKPStats> {
    return { ...this.stats };
  }
}

export async function proveWithZkp(frames: string | FLogicFrameFact[], query: string, backend?: ZKPBackendProtocol): Promise<FLogicZKPResult> {
  return new FLogicZKPIntegration(backend).proveWithZkp(frames, query);
}

export async function verifyFLogicZkpProof(result: FLogicZKPResult, backend?: ZKPBackendProtocol): Promise<boolean> {
  return new FLogicZKPIntegration(backend).verifyProof(result);
}

export function parseFLogicFacts(text: string): FLogicFrameFact[] {
  const facts: FLogicFrameFact[] = [];
  for (const raw of text.split(/[.\n]+/).map(part => part.trim()).filter(Boolean)) {
    const frame = raw.match(/^([A-Za-z_][\w:-]*)\s*\[\s*([A-Za-z_][\w:-]*)\s*->\s*([^\]]+)\s*\]$/);
    if (frame) {
      facts.push(normalizeFact({ subject: frame[1]!, slot: frame[2]!, value: frame[3]! }));
      continue;
    }
    const predicate = raw.match(/^([A-Za-z_][\w:-]*)\(([^,]+),\s*([^)]+)\)$/);
    if (predicate) {
      facts.push(normalizeFact({ subject: predicate[2]!, slot: predicate[1]!, value: predicate[3]! }));
    }
  }
  return facts;
}

export function evaluateQuery(facts: FLogicFrameFact[], query: string): boolean {
  const queryFacts = parseFLogicFacts(query);
  if (!queryFacts.length) return facts.some(fact => canonicalFact(fact) === canonicalFact(parseQueryAtom(query)));
  return queryFacts.every(q => facts.some(fact => canonicalFact(fact) === canonicalFact(q)));
}

function parseQueryAtom(query: string): FLogicFrameFact {
  const parsed = parseFLogicFacts(query);
  return parsed[0] ?? normalizeFact({ subject: query, slot: 'holds', value: 'true' });
}

function normalizeFact(fact: FLogicFrameFact): FLogicFrameFact {
  return {
    subject: normalizeSymbol(fact.subject),
    slot: normalizeSymbol(fact.slot),
    value: normalizeSymbol(fact.value),
  };
}

function canonicalFact(fact: FLogicFrameFact): string {
  return `${fact.subject}[${fact.slot}->${fact.value}]`;
}

function normalizeSymbol(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '_').toLowerCase();
}

function sha256(value: string): string {
  return sha256Hex(value);
}

export type Groth16Proof = ZKPProofLike;
