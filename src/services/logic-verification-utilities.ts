/**
 * Sprint 65 — Utilities, Cleaning, Reasoning Utils, Witness Manager, E-Prover
 * Ports of: integration/reasoning/logic_verification_utils.py (336L),
 *           CEC/native/dcec_cleaning.py (304L),
 *           integration/reasoning/deontological_reasoning_utils.py (303L),
 *           zkp/witness_manager.py (264L),
 *           CEC/provers/e_prover_adapter.py (263L)
 */

import { spawnSync } from 'node:child_process';
import { createTptpProblem, extractTptpProofSteps, parseSzsStatus } from './provers/tptp-problem.js';
import { Groth16Backend, type ZKPBackendProtocol } from './zkp/zkp-backends.js';

// ---------------------------------------------------------------------------
// Logic Verification Utils (logic_verification_utils.py)
// ---------------------------------------------------------------------------

export interface LogicAxiom { name: string; formula: string; type: string }
export interface ProofStep   { rule: string; premises: string[]; conclusion: string }

export function getBasicAxioms(): LogicAxiom[] {
  return [
    { name: 'modus_ponens',   formula: '(P ∧ (P → Q)) → Q',      type: 'propositional' },
    { name: 'modus_tollens',  formula: '((P → Q) ∧ ¬Q) → ¬P',   type: 'propositional' },
    { name: 'hypothetical_syllogism', formula: '((P → Q) ∧ (Q → R)) → (P → R)', type: 'propositional' },
    { name: 'disjunctive_syllogism',  formula: '((P ∨ Q) ∧ ¬P) → Q', type: 'propositional' },
    { name: 'simplification', formula: '(P ∧ Q) → P', type: 'propositional' },
    { name: 'conjunction',    formula: 'P → (Q → (P ∧ Q))', type: 'propositional' },
  ];
}

export function getBasicProofRules(): Record<string, unknown>[] {
  return [
    { name: 'mp',  displayName: 'Modus Ponens',        premises: ['P', 'P→Q'], conclusion: 'Q' },
    { name: 'mt',  displayName: 'Modus Tollens',       premises: ['P→Q', '¬Q'], conclusion: '¬P' },
    { name: 'hs',  displayName: 'Hypothetical Syllogism', premises: ['P→Q', 'Q→R'], conclusion: 'P→R' },
    { name: 'ds',  displayName: 'Disjunctive Syllogism',  premises: ['P∨Q', '¬P'], conclusion: 'Q' },
    { name: 'simp',displayName: 'Simplification',      premises: ['P∧Q'], conclusion: 'P' },
    { name: 'conj',displayName: 'Conjunction',         premises: ['P', 'Q'],  conclusion: 'P∧Q' },
  ];
}

export function validateFormulaSyntax(formula: string): boolean {
  if (!formula.trim()) return false;
  let depth = 0;
  for (const ch of formula) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

export function parseProofSteps(proofText: string): ProofStep[] {
  const steps: ProofStep[] = [];
  for (const line of proofText.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*⊢\s*(.+)$/);
    if (m) steps.push({ rule: m[1], premises: m[2].split(',').map(s => s.trim()), conclusion: m[3].trim() });
  }
  return steps;
}

export function areContradictory(formula1: string, formula2: string): boolean {
  const neg1 = formula1.startsWith('¬') ? formula1.slice(1) : `¬${formula1}`;
  const neg2 = formula2.startsWith('¬') ? formula2.slice(1) : `¬${formula2}`;
  return formula1 === neg2 || formula2 === neg1;
}

// ---------------------------------------------------------------------------
// DCEC Cleaning (dcec_cleaning.py)
// ---------------------------------------------------------------------------

export function stripWhitespace(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim();
}

export function stripComments(expression: string): string {
  return expression
    .replace(/;[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
}

export function consolidateParens(expression: string): string {
  // Remove double parens: ((X)) → (X)
  let prev = '';
  let result = expression;
  while (prev !== result) {
    prev = result;
    result = result.replace(/\(\(([^()]+)\)\)/g, '($1)');
  }
  return result;
}

export function checkParens(expression: string): boolean {
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

export function getMatchingCloseParen(input: string, openIdx = 0): number | null {
  let depth = 0;
  for (let i = openIdx; i < input.length; i++) {
    if (input[i] === '(') depth++;
    else if (input[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deontological Reasoning Utils (deontological_reasoning_utils.py)
// ---------------------------------------------------------------------------

export const DeonticPatterns = {
  OBLIGATION_KEYWORDS:  ['must', 'shall', 'required', 'obligated', 'obligatory'],
  PERMISSION_KEYWORDS:  ['may', 'can', 'allowed', 'permitted', 'permissible'],
  PROHIBITION_KEYWORDS: ['must not', 'shall not', 'forbidden', 'prohibited', 'illegal'],
  NEGATION_KEYWORDS:    ['not', 'never', 'no', 'neither', 'nor'],
};

export function extractKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const words = new Set<string>();
  for (const group of Object.values(DeonticPatterns)) {
    for (const kw of group) {
      if (lower.includes(kw)) words.add(kw);
    }
  }
  // also extract content words ≥4 chars
  for (const w of lower.match(/\b[a-z]{4,}\b/g) ?? []) words.add(w);
  return words;
}

export function calculateTextSimilarity(text1: string, text2: string): number {
  const w1 = new Set(text1.toLowerCase().match(/\b\w{3,}\b/g) ?? []);
  const w2 = new Set(text2.toLowerCase().match(/\b\w{3,}\b/g) ?? []);
  if (w1.size === 0 && w2.size === 0) return 1;
  const inter = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return union > 0 ? inter / union : 0;
}

export function areEntitiesSimilar(e1: string, e2: string, threshold = 0.7): boolean {
  return calculateTextSimilarity(e1, e2) >= threshold;
}

export function areActionsSimilar(a1: string, a2: string, threshold = 0.6): boolean {
  return calculateTextSimilarity(a1, a2) >= threshold;
}

// ---------------------------------------------------------------------------
// ZKP Witness Manager (witness_manager.py)
// ---------------------------------------------------------------------------

export interface WitnessRecord {
  witnessId: string;
  formula:   string;
  axioms:    string[];
  witness:   Record<string, unknown>;
  generatedAt: number;
}

export interface WitnessManagerStats { generated: number; verified: number; failures: number }

export class WitnessManager {
  private readonly witnesses = new Map<string, WitnessRecord>();
  private readonly backend: ZKPBackendProtocol;
  private readonly stats: WitnessManagerStats = { generated: 0, verified: 0, failures: 0 };
  private counter = 0;

  constructor(backend: ZKPBackendProtocol = new Groth16Backend(null)) {
    this.backend = backend;
  }

  async generateWitness(formula: string, axioms: string[] = []): Promise<WitnessRecord> {
    this.stats.generated++;
    const id = `wit-${++this.counter}`;
    const proof = await this.backend.generateProof(JSON.stringify({ formula, axioms }));
    const record: WitnessRecord = {
      witnessId:   id,
      formula,
      axioms,
      witness:     proof.toDict(),
      generatedAt: Date.now(),
    };
    this.witnesses.set(id, record);
    return record;
  }

  async verifyWitness(witnessId: string): Promise<boolean> {
    const record = this.witnesses.get(witnessId);
    if (!record) { this.stats.failures++; return false; }
    this.stats.verified++;
    const verified = await this.backend.verifyProof(JSON.stringify(record.witness));
    if (!verified) this.stats.failures++;
    return verified;
  }

  getWitness(witnessId: string): WitnessRecord | null { return this.witnesses.get(witnessId) ?? null; }
  getStats(): Readonly<WitnessManagerStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// E-Prover Adapter (e_prover_adapter.py)
// ---------------------------------------------------------------------------

export interface EProverProofResult {
  isProved:   boolean;
  status:     string;
  proofSteps: string[];
  cpuTime:    number;
  error?:     string;
}

export interface EProverStats { totalProofs: number; succeeded: number; failed: number; avgCpuTime: number }

export interface EProverProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
  readonly signal?: string | null;
  readonly error?: string;
}

export type EProverRunner = (
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
) => EProverProcessResult;

export interface EProverOptions {
  binary?: string;
  runner?: EProverRunner;
  availabilityCheck?: () => boolean;
}

function defaultEProverRunner(command: string, args: string[], input: string, timeoutMs: number): EProverProcessResult {
  const result = spawnSync(command, args, { input, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
    error: result.error?.message,
  };
}

function commandAvailable(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2_000 });
  return !result.error && (result.status === 0 || result.status === null);
}

function ensureTptpProblem(formula: string, axioms: string[]): string {
  if (/^\s*(?:fof|cnf)\(/i.test(formula)) return formula;
  return createTptpProblem({
    name: 'eprover_problem',
    axioms: axioms.map((axiom, index) => ({ name: `ax_${index + 1}`, role: 'axiom', formula: axiom })),
    conjectures: [{ name: 'goal_1', role: 'conjecture', formula }],
  });
}

function szsStatusToResult(status: string | undefined): { proved: boolean; status: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'theorem':
    case 'unsatisfiable':
    case 'contradictoryaxioms':
      return { proved: true, status: `SZS_${status}` };
    case 'satisfiable':
    case 'countersatisfiable':
    case 'gaveup':
    case 'timeout':
    case 'resourceout':
    case 'unknown':
      return { proved: false, status: `SZS_${status}` };
    default:
      return { proved: false, status: 'SZS_Unknown' };
  }
}

export class EProverAdapter {
  private readonly stats: EProverStats = { totalProofs: 0, succeeded: 0, failed: 0, avgCpuTime: 0 };
  private readonly binary: string;
  private readonly runner: EProverRunner;

  constructor(private readonly opts: EProverOptions = {}) {
    this.binary = opts.binary ?? 'eprover';
    this.runner = opts.runner ?? defaultEProverRunner;
  }

  isAvailable(): boolean {
    return this.opts.availabilityCheck ? this.opts.availabilityCheck() : commandAvailable(this.binary, ['--version']);
  }

  async prove(formula: string, axioms: string[] = [], timeoutMs = 10_000): Promise<EProverProofResult> {
    const t0 = performance.now();
    this.stats.totalProofs++;

    if (!this.isAvailable()) {
      this.stats.failed++;
      return { isProved: false, status: 'GaveUp', proofSteps: [], cpuTime: 0, error: 'E prover binary not found' };
    }

    const input = ensureTptpProblem(formula, axioms);
    const result = this.runner(
      this.binary,
      ['--auto', '--tstp-in', '--tstp-out', `--cpu-limit=${Math.max(1, Math.ceil(timeoutMs / 1000))}`],
      input,
      timeoutMs,
    );
    const output = [result.stdout, result.stderr ?? ''].filter(Boolean).join('\n');
    const szsStatus = parseSzsStatus(output);
    const mapped = szsStatusToResult(szsStatus);
    const proofSteps = extractTptpProofSteps(output);
    const error = result.error ?? (result.status && result.status !== 0 && !output ? `E prover exited with status ${result.status}` : undefined);
    const cpuTime = (performance.now() - t0) / 1000;
    this._updateAvg(cpuTime);

    if (mapped.proved && !error) {
      this.stats.succeeded++;
    } else {
      this.stats.failed++;
    }

    return {
      isProved: mapped.proved && !error,
      status: mapped.status,
      proofSteps,
      cpuTime,
      ...(error ? { error } : {}),
    };
  }

  getStats(): Readonly<EProverStats> { return { ...this.stats }; }

  private _updateAvg(t: number): void {
    const n = this.stats.totalProofs;
    this.stats.avgCpuTime = ((n - 1) * this.stats.avgCpuTime + t) / n;
  }
}

export function checkEproverInstallation(): boolean {
  return new EProverAdapter().isAvailable();
}
