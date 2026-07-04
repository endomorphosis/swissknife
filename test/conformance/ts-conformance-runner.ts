import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { WasmProverHub } from '../../src/services/mcp-wasm-prover-hub.js';
import type { Policy } from '../../src/services/mcp-policy.js';
import type { WasmProofResult } from '../../src/services/provers/prover-types.js';

export type ConformanceSubsystem =
  | 'propositional'
  | 'fol'
  | 'temporal'
  | 'deontic'
  | 'modal'
  | 'dcec'
  | 'legal-norm'
  | 'zkp-statement';

export type BackendMode = 'real' | 'simulated' | 'host-dependent';

export interface ConformanceVector {
  id: string;
  subsystem: ConformanceSubsystem;
  description?: string;
  inputType: 'policy' | 'smt2' | 'dcec' | 'tdfol' | 'legalNorm' | 'zkpStatement';
  input: {
    policy?: Policy;
    smt2?: string;
    [key: string]: unknown;
  };
  expected: {
    status: string;
    acceptableReasons: string[];
    decided?: boolean;
    backendMode?: BackendMode;
    [key: string]: unknown;
  };
  timeoutMs?: number;
  tags?: string[];
  metamorphic?: Record<string, unknown>;
}

export interface ConformanceResult {
  vectorId: string;
  subsystem: ConformanceSubsystem;
  status: string;
  reason?: string;
  backendMode: BackendMode;
  proverId: string;
  durationMs: number;
  modelHash?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ConformanceResultEnvelope {
  schemaVersion: string;
  runner: 'typescript-swissknife';
  generatedAt: string;
  submoduleCommit?: string;
  engineVersions: Record<string, string>;
  results: ConformanceResult[];
}

export interface RunTsConformanceOptions {
  vectorsDir?: string;
  outPath?: string;
  mockZ3?: boolean;
  subsystems?: ConformanceSubsystem[];
  limit?: number;
}

interface VectorCorpusFile {
  schemaVersion: string;
  vectors: ConformanceVector[];
}

const RESULT_SCHEMA_VERSION = '2026-07-03';
const ALL_SUBSYSTEMS: ConformanceSubsystem[] = [
  'propositional',
  'fol',
  'temporal',
  'deontic',
  'modal',
  'dcec',
  'legal-norm',
  'zkp-statement',
];

export function defaultVectorsDir(startDir = process.cwd()): string {
  const root = findRepoRoot(startDir);
  return resolve(root, 'implementation_plan/conformance/vectors');
}

export function loadConformanceVectors(vectorsDir = defaultVectorsDir()): ConformanceVector[] {
  const dir = resolve(vectorsDir);
  const files = readdirSync(dir).filter(file => file.endsWith('.json')).sort();
  const vectors: ConformanceVector[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as VectorCorpusFile;
    if (!Array.isArray(parsed.vectors)) {
      throw new Error(`Conformance corpus ${file} does not contain a vectors array`);
    }
    for (const vector of parsed.vectors) {
      validateVector(vector, file);
      if (seen.has(vector.id)) throw new Error(`Duplicate conformance vector id: ${vector.id}`);
      seen.add(vector.id);
      vectors.push(vector);
    }
  }

  return vectors;
}

export async function runTsConformance(options: RunTsConformanceOptions = {}): Promise<ConformanceResultEnvelope> {
  const mockZ3 = options.mockZ3 ?? process.env.SWISSKNIFE_CONFORMANCE_LIVE_Z3 !== '1';
  let vectors = loadConformanceVectors(options.vectorsDir);
  if (options.subsystems?.length) {
    const wanted = new Set(options.subsystems);
    vectors = vectors.filter(vector => wanted.has(vector.subsystem));
  }
  if (options.limit !== undefined) vectors = vectors.slice(0, options.limit);

  const hub = await WasmProverHub.create({ timeoutMs: 500 });
  if (mockZ3) injectDeterministicZ3(hub);

  const results: ConformanceResult[] = [];
  for (const vector of vectors) {
    results.push(await runVector(vector, hub, { mockZ3 }));
  }

  const envelope: ConformanceResultEnvelope = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runner: 'typescript-swissknife',
    generatedAt: new Date().toISOString(),
    submoduleCommit: process.env.SWISSKNIFE_CONFORMANCE_SUBMODULE_COMMIT,
    engineVersions: {
      runner: 'ts-conformance-runner',
      z3Mode: mockZ3 ? 'deterministic-simulated' : 'live',
      hub: 'WasmProverHub',
    },
    results,
  };

  if (options.outPath) writeResultEnvelope(envelope, options.outPath);
  return envelope;
}

export function assertCorpusCoverage(vectors: ConformanceVector[]): Record<ConformanceSubsystem, number> {
  const counts = Object.fromEntries(ALL_SUBSYSTEMS.map(subsystem => [subsystem, 0])) as Record<ConformanceSubsystem, number>;
  for (const vector of vectors) counts[vector.subsystem] += 1;
  for (const subsystem of ALL_SUBSYSTEMS) {
    if (counts[subsystem] < 10) {
      throw new Error(`Conformance subsystem ${subsystem} has ${counts[subsystem]} vectors; expected at least 10`);
    }
  }
  return counts;
}

export function writeResultEnvelope(envelope: ConformanceResultEnvelope, outPath: string): void {
  const abs = resolve(outPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
}

async function runVector(
  vector: ConformanceVector,
  hub: WasmProverHub,
  options: { mockZ3: boolean },
): Promise<ConformanceResult> {
  const started = Date.now();
  try {
    let proof: WasmProofResult;
    if (vector.inputType === 'policy' && vector.input.policy) {
      proof = await hub.checkPolicyConsistency(vector.input.policy);
    } else if (vector.inputType === 'smt2' && typeof vector.input.smt2 === 'string') {
      proof = await hub.proveSMT2(vector.input.smt2, vector.timeoutMs);
    } else {
      proof = unsupportedVectorResult(vector);
    }

    return {
      vectorId: vector.id,
      subsystem: vector.subsystem,
      status: proof.reason,
      reason: proof.reason,
      backendMode: inferBackendMode(vector, proof, options.mockZ3),
      proverId: String(proof.prover_id),
      durationMs: Math.max(0, Date.now() - started),
      modelHash: proof.model ? stableHash(proof.model) : undefined,
      metadata: {
        expected: vector.expected.status,
        acceptableReasons: vector.expected.acceptableReasons,
        tags: vector.tags ?? [],
        proofMeta: proof.meta ?? {},
      },
    };
  } catch (error) {
    return {
      vectorId: vector.id,
      subsystem: vector.subsystem,
      status: 'error',
      reason: 'error',
      backendMode: inferBackendMode(vector, undefined, options.mockZ3),
      proverId: 'typescript-swissknife',
      durationMs: Math.max(0, Date.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function unsupportedVectorResult(vector: ConformanceVector): WasmProofResult {
  return {
    proved: false,
    sat: false,
    unsat: false,
    reason: 'unknown',
    prover_id: 'z3-wasm',
    proof_time_ms: 0,
    meta: { skipped: 'unsupported-vector-input', inputType: vector.inputType },
  };
}

function inferBackendMode(vector: ConformanceVector, proof: WasmProofResult | undefined, mockZ3: boolean): BackendMode {
  if (vector.expected.backendMode === 'simulated') return 'simulated';
  if (vector.expected.backendMode === 'real') return 'real';
  if (!proof) return vector.expected.backendMode ?? 'host-dependent';
  if (mockZ3 && proof.prover_id === 'z3-wasm') return 'simulated';
  if (proof.meta?.skipped || proof.reason === 'unknown' || proof.reason === 'error') return 'host-dependent';
  return 'real';
}

function injectDeterministicZ3(hub: WasmProverHub): void {
  const bridge = {
    checkPolicyConsistency: async (policy: Policy): Promise<WasmProofResult> => deterministicPolicyResult(policy),
    proveSMT2: async (): Promise<WasmProofResult> => ({
      proved: false,
      sat: false,
      unsat: false,
      reason: 'unknown',
      prover_id: 'z3-wasm',
      proof_time_ms: 0,
      meta: { simulated: true, skipped: 'smt2-live-z3-disabled' },
    }),
  };
  (hub as unknown as Record<string, unknown>)['z3'] = bridge;
}

function deterministicPolicyResult(policy: Policy): WasmProofResult {
  const start = Date.now();
  const conflict = hasExactPermissionConflict(policy) || hasObligationProhibitionConflict(policy);
  if (conflict) {
    return {
      proved: false,
      sat: false,
      unsat: true,
      reason: 'refuted',
      prover_id: 'z3-wasm',
      proof_time_ms: Math.max(0, Date.now() - start),
      meta: { simulated: true, conflict },
    };
  }
  return {
    proved: true,
    sat: true,
    unsat: false,
    reason: 'sat',
    prover_id: 'z3-wasm',
    proof_time_ms: Math.max(0, Date.now() - start),
    meta: { simulated: true },
  };
}

function hasExactPermissionConflict(policy: Policy): string | null {
  const permissions = new Set((policy.permissions ?? []).map(rule => `${rule.cap}|${rule.rsc}`));
  for (const prohibition of policy.prohibitions ?? []) {
    if (permissions.has(`${prohibition.cap}|${prohibition.rsc}`)) {
      return `${prohibition.cap}_${prohibition.rsc}`;
    }
  }
  return null;
}

function hasObligationProhibitionConflict(policy: Policy): string | null {
  const prohibited = new Set((policy.prohibitions ?? []).map(rule => atomName(rule.cap, rule.rsc)));
  for (const obligation of policy.obligations ?? []) {
    const descriptionAtom = normalizeAtom(obligation.description);
    const requiredAtom = obligation.requiredCap ? atomName(obligation.requiredCap, obligation.rsc ?? '') : '';
    if (prohibited.has(descriptionAtom)) return descriptionAtom;
    if (requiredAtom && prohibited.has(requiredAtom)) return requiredAtom;
  }
  return null;
}

function atomName(cap: string, rsc: string): string {
  return normalizeAtom(rsc ? `${cap}_${rsc}` : cap);
}

function normalizeAtom(value: string): string {
  return String(value).trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',') + '}';
}

function validateVector(vector: ConformanceVector, source: string): void {
  if (!vector.id || !vector.subsystem || !vector.inputType || !vector.input || !vector.expected) {
    throw new Error(`Invalid conformance vector in ${source}: ${JSON.stringify(vector)}`);
  }
  if (!ALL_SUBSYSTEMS.includes(vector.subsystem)) {
    throw new Error(`Unknown conformance subsystem ${vector.subsystem} in ${source}`);
  }
  if (!Array.isArray(vector.expected.acceptableReasons) || vector.expected.acceptableReasons.length === 0) {
    throw new Error(`Vector ${vector.id} in ${source} has no acceptableReasons`);
  }
}

function findRepoRoot(startDir: string): string {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(resolve(current, 'implementation_plan/conformance'))) return current;
    const parent = resolve(current, '..');
    if (parent === current) return resolve(startDir, '..');
    current = parent;
  }
}

export function parseCliArgs(argv: string[]): RunTsConformanceOptions {
  const options: RunTsConformanceOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--vectors') options.vectorsDir = argv[++i];
    else if (arg === '--out') options.outPath = argv[++i];
    else if (arg === '--live-z3') options.mockZ3 = false;
    else if (arg === '--mock-z3') options.mockZ3 = true;
    else if (arg === '--limit') options.limit = Number(argv[++i]);
    else if (arg === '--subsystems') options.subsystems = argv[++i].split(',') as ConformanceSubsystem[];
    else if (arg === '--help') {
      printHelpAndExit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelpAndExit(code: number): never {
  console.log(`Usage: tsx test/conformance/ts-conformance-runner.ts [options]

Options:
  --vectors <dir>       Directory containing shared vector JSON files
  --out <file>          Write ConformanceResult envelope JSON
  --subsystems <list>   Comma-separated subsystem filter
  --limit <n>           Limit vector count after filtering
  --mock-z3             Force deterministic simulated Z3 bridge
  --live-z3             Use the live Z3 bridge
`);
  process.exit(code);
}
