/**
 * logic-verifier.ts
 *
 * Logic formula verifier with axiom management + proof engine.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/logic_verification.py
 *   ipfs_datasets_py/logic/integration/reasoning/logic_verification_types.py
 *
 * Provides:
 *   VerificationResult   — enum: VALID | INVALID | UNKNOWN | TIMEOUT | ERROR
 *   LogicAxiom           — axiom/rule definition
 *   ProofStep            — one step in a proof
 *   ProofResult          — full proof outcome
 *   ConsistencyCheck     — multi-formula consistency result
 *   EntailmentResult     — entailment check result
 *   LogicVerifier        — main verifier class
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum VerificationResult {
  VALID   = 'valid',
  INVALID = 'invalid',
  UNKNOWN = 'unknown',
  TIMEOUT = 'timeout',
  ERROR   = 'error',
}

// ---------------------------------------------------------------------------
// LogicAxiom
// ---------------------------------------------------------------------------

export interface LogicAxiom {
  name: string;
  formula: string;
  description: string;
  axiomType: 'user_defined' | 'built_in' | 'derived';
  confidence: number;
  metadata: Record<string, unknown>;
}

export function makeAxiom(
  name: string,
  formula: string,
  description: string,
  axiomType: LogicAxiom['axiomType'] = 'user_defined',
  confidence = 1.0,
): LogicAxiom {
  return { name, formula, description, axiomType, confidence, metadata: {} };
}

// ---------------------------------------------------------------------------
// ProofStep
// ---------------------------------------------------------------------------

export interface ProofStep {
  stepNumber: number;
  formula: string;
  justification: string;
  ruleName: string;
  premises: string[];
}

// ---------------------------------------------------------------------------
// ProofResult
// ---------------------------------------------------------------------------

export interface ProofResult {
  proved: boolean;
  formula: string;
  steps: ProofStep[];
  method: string;
  timeMs: number;
  confidence: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// ConsistencyCheck
// ---------------------------------------------------------------------------

export interface ConsistencyCheck {
  isConsistent: boolean;
  conflictingFormulas: string[][];
  confidence: number;
  explanation: string;
  methodUsed: string;
}

// ---------------------------------------------------------------------------
// EntailmentResult
// ---------------------------------------------------------------------------

export interface EntailmentResult {
  entails: boolean;
  premises: string[];
  conclusion: string;
  confidence: number;
  explanation: string;
  proofSteps: ProofStep[];
}

// ---------------------------------------------------------------------------
// Built-in axioms
// ---------------------------------------------------------------------------

function getBasicAxioms(): LogicAxiom[] {
  return [
    makeAxiom('modus_ponens', '((P → Q) ∧ P) → Q',
      'If P implies Q and P is true, then Q is true', 'built_in'),
    makeAxiom('conjunction_intro', '(P ∧ Q) → P',
      'From a conjunction, either conjunct follows', 'built_in'),
    makeAxiom('disjunction_elim', '(P ∨ Q) ∧ ¬P → Q',
      'If P or Q and not P, then Q', 'built_in'),
    makeAxiom('double_negation', '¬¬P → P',
      'Double negation elimination', 'built_in'),
    makeAxiom('deontic_d_rule', 'O(φ) → P(φ)',
      'What is obligatory is permitted', 'built_in'),
    makeAxiom('hypothetical_syllogism', '((P → Q) ∧ (Q → R)) → (P → R)',
      'Transitivity of implication', 'built_in'),
  ];
}

// ---------------------------------------------------------------------------
// Formula utilities
// ---------------------------------------------------------------------------

function validateFormulaSyntax(formula: string): boolean {
  if (!formula?.trim()) return false;
  // Basic balance check for parentheses
  let depth = 0;
  for (const ch of formula) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function areContradictory(f1: string, f2: string): boolean {
  // Simplified: ¬φ and φ are contradictory
  const f1t = f1.trim();
  const f2t = f2.trim();
  return f1t === `¬${f2t}` || f2t === `¬${f1t}` ||
    f1t === `¬(${f2t})` || f2t === `¬(${f1t})` ||
    f1t === `not ${f2t}` || f2t === `not ${f1t}`;
}

// ---------------------------------------------------------------------------
// LogicVerifier
// ---------------------------------------------------------------------------

export class LogicVerifier {
  private axioms: LogicAxiom[] = [];
  private proofCache = new Map<string, ProofResult>();

  constructor(opts: { initBasicAxioms?: boolean } = {}) {
    if (opts.initBasicAxioms !== false) {
      this.axioms.push(...getBasicAxioms());
    }
  }

  addAxiom(axiom: LogicAxiom): boolean {
    const exists = this.axioms.some(a => a.name === axiom.name);
    if (exists) return false;
    this.axioms.push(axiom);
    return true;
  }

  removeAxiom(name: string): boolean {
    const before = this.axioms.length;
    this.axioms = this.axioms.filter(a => a.name !== name);
    return this.axioms.length < before;
  }

  clearAxioms(): void {
    this.axioms = [];
  }

  getAxioms(): LogicAxiom[] {
    return [...this.axioms];
  }

  /**
   * Verify that `formula` follows from the axiom base via simple forward lookup.
   */
  verifyFormula(formula: string): ProofResult {
    const t0 = performance.now();
    const key = formula.trim();

    if (this.proofCache.has(key)) return this.proofCache.get(key)!;

    if (!validateFormulaSyntax(formula)) {
      return { proved: false, formula, steps: [], method: 'syntax_check', timeMs: performance.now() - t0, confidence: 0, errors: ['Invalid formula syntax'] };
    }

    // Check direct axiom match
    const axiom = this.axioms.find(a => a.formula === key || a.name === key);
    if (axiom) {
      const result: ProofResult = {
        proved: true, formula, steps: [{ stepNumber: 1, formula, justification: `Axiom: ${axiom.name}`, ruleName: axiom.name, premises: [] }],
        method: 'axiom_lookup', timeMs: performance.now() - t0, confidence: axiom.confidence, errors: [],
      };
      this.proofCache.set(key, result);
      return result;
    }

    // Modus ponens: find P→formula as an axiom and P also in axioms
    for (const ax of this.axioms) {
      const imp = ax.formula.match(/^(.+)\s*→\s*(.+)$/);
      if (!imp) continue;
      const [, antecedent, consequent] = imp;
      if (consequent.trim() === key) {
        const antAxiom = this.axioms.find(a => a.formula === antecedent.trim());
        if (antAxiom) {
          const result: ProofResult = {
            proved: true, formula,
            steps: [
              { stepNumber: 1, formula: antAxiom.formula, justification: `Axiom: ${antAxiom.name}`, ruleName: antAxiom.name, premises: [] },
              { stepNumber: 2, formula: ax.formula, justification: `Axiom: ${ax.name}`, ruleName: ax.name, premises: [] },
              { stepNumber: 3, formula, justification: 'Modus Ponens', ruleName: 'modus_ponens', premises: [antAxiom.formula, ax.formula] },
            ],
            method: 'forward_chaining', timeMs: performance.now() - t0, confidence: Math.min(antAxiom.confidence, ax.confidence), errors: [],
          };
          this.proofCache.set(key, result);
          return result;
        }
      }
    }

    const result: ProofResult = {
      proved: false, formula, steps: [], method: 'exhausted', timeMs: performance.now() - t0, confidence: 0,
      errors: [`Cannot prove formula: ${formula}`],
    };
    this.proofCache.set(key, result);
    return result;
  }

  /**
   * Try to prove `goal` using the given `premises` (added temporarily).
   */
  proveWithAxioms(goal: string, premises: string[]): ProofResult {
    const tmpAxioms = premises.map((p, i) => makeAxiom(`premise_${i}`, p, 'User premise', 'user_defined'));
    for (const a of tmpAxioms) this.addAxiom(a);
    const result = this.verifyFormula(goal);
    for (const a of tmpAxioms) this.removeAxiom(a.name);
    return result;
  }

  /** Check whether a set of formulas is mutually consistent. */
  checkConsistency(formulas: string[]): ConsistencyCheck {
    const conflicts: string[][] = [];
    for (let i = 0; i < formulas.length; i++) {
      for (let j = i + 1; j < formulas.length; j++) {
        if (areContradictory(formulas[i], formulas[j])) {
          conflicts.push([formulas[i], formulas[j]]);
        }
      }
    }
    return {
      isConsistent: conflicts.length === 0,
      conflictingFormulas: conflicts,
      confidence: 0.9,
      explanation: conflicts.length === 0 ? 'No direct contradictions detected' : `Found ${conflicts.length} contradictory pair(s)`,
      methodUsed: 'syntactic_contradiction_check',
    };
  }

  /** Check whether `conclusion` is entailed by `premises`. */
  checkEntailment(premises: string[], conclusion: string): EntailmentResult {
    const proof = this.proveWithAxioms(conclusion, premises);
    return {
      entails: proof.proved,
      premises,
      conclusion,
      confidence: proof.confidence,
      explanation: proof.proved ? 'Conclusion follows from premises' : 'Cannot establish entailment',
      proofSteps: proof.steps,
    };
  }
}
