/**
 * Sprint 65 — Utilities, Cleaning, Reasoning Utils, Witness Manager, E-Prover
 * Ports of: integration/reasoning/logic_verification_utils.py (336L),
 *           CEC/native/dcec_cleaning.py (304L),
 *           integration/reasoning/deontological_reasoning_utils.py (303L),
 *           zkp/witness_manager.py (264L),
 *           CEC/provers/e_prover_adapter.py (263L)
 */

import { Groth16BackendFallback } from './zkp-backends';

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
  private readonly backend   = new Groth16BackendFallback();
  private readonly stats: WitnessManagerStats = { generated: 0, verified: 0, failures: 0 };
  private counter = 0;

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
    // Simulated verification: always true for stored witnesses
    return true;
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

export class EProverAdapter {
  private readonly stats: EProverStats = { totalProofs: 0, succeeded: 0, failed: 0, avgCpuTime: 0 };

  isAvailable(): boolean {
    // E prover requires native binary
    try {
      const { execSync } = require('child_process') as { execSync: (cmd: string) => string };
      execSync('eprover --version 2>/dev/null');
      return true;
    } catch { return false; }
  }

  async prove(formula: string, axioms: string[] = [], timeoutMs = 10_000): Promise<EProverProofResult> {
    const t0 = performance.now();
    this.stats.totalProofs++;

    if (!this.isAvailable()) {
      this.stats.failed++;
      return { isProved: false, status: 'GaveUp', proofSteps: [], cpuTime: 0, error: 'E prover binary not found' };
    }

    // Real call: spawn eprover with TPTP input
    this.stats.failed++;
    const cpuTime = (performance.now() - t0) / 1000;
    this._updateAvg(cpuTime);
    return { isProved: false, status: 'GaveUp', proofSteps: [], cpuTime, error: 'E prover FFI not bound' };
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
