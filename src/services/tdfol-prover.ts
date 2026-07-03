/**
 * tdfol-prover.ts
 *
 * TDFOL theorem prover — combines a TDFOLKnowledgeBase, built-in inference
 * rules, and a ModalTableaux fallback into a unified prove() API.
 *
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/tdfol_prover.py
 *
 * Provides:
 *   TDFOLInferenceRule  — base interface for inference rules
 *   (built-in rules)    — temporal/deontic necessitation, distribution, D-rule,
 *                         permission intro, prohibition elimination
 *   ProofStatus         — PROVED | FAILED | TIMEOUT | ERROR
 *   ProofStep           — (formula, justification) pair
 *   ProofResult         — full result object returned by prove()
 *   TDFOLProver         — main prover class
 */

import {
  Formula,
  BinaryFormula,
  DeonticFormulaTDFOL,
  TemporalFormulaTDFOL,
  TDFOLKnowledgeBase,
  mkBinary,
  mkDeontic,
  mkTemporal,
} from './tdfol-core.js';
import { ModalTableaux, ModalLogicType } from './modal-tableaux.js';

// ---------------------------------------------------------------------------
// ProofStatus / ProofStep / ProofResult
// ---------------------------------------------------------------------------

export enum ProofStatus {
  PROVED  = 'proved',
  FAILED  = 'failed',
  TIMEOUT = 'timeout',
  ERROR   = 'error',
}

export interface ProofStep {
  formula: Formula;
  justification: string;
}

export interface ProofResult {
  status: ProofStatus;
  formula: Formula | null;
  proofSteps: ProofStep[];
  timeMs: number;
  method: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// TDFOLInferenceRule
// ---------------------------------------------------------------------------

export interface TDFOLInferenceRule {
  readonly name: string;
  /**
   * Try to derive new formulas from `kb`.
   * Returns any newly derived formulas (empty array = nothing new).
   */
  apply(kb: TDFOLKnowledgeBase): Formula[];
}

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

/** □(φ → ψ), □φ  ⊢  □ψ  (Temporal Distribution / K-axiom) */
class TemporalDistributionRule implements TDFOLInferenceRule {
  readonly name = 'TemporalDistributionRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    const all = kb.getFormulas();
    for (const f1 of all) {
      const t1 = f1 as TemporalFormulaTDFOL;
      if (t1.kind !== 'temporal' || t1.operator !== '□') continue;
      const inner = t1.formula as BinaryFormula;
      if (inner.kind !== 'binary' || inner.operator !== '→') continue;
      // Look for □(antecedent) in KB
      for (const f2 of all) {
        const t2 = f2 as TemporalFormulaTDFOL;
        if (t2.kind !== 'temporal' || t2.operator !== '□') continue;
        if (t2.formula !== (inner.left as Formula) && t2.formula?.toStr?.() !== (inner.left as Formula)?.toStr?.()) continue;
        derived.push(mkTemporal('□', inner.right as Formula));
      }
    }
    return derived;
  }
}

/** □(φ → ψ)  ⊢  □φ → □ψ  (Temporal Necessitation variant) */
class TemporalNecessitationRule implements TDFOLInferenceRule {
  readonly name = 'TemporalNecessitationRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const t = f as TemporalFormulaTDFOL;
      if (t.kind !== 'temporal' || t.operator !== '□') continue;
      const inner = t.formula as BinaryFormula;
      if (inner.kind !== 'binary' || inner.operator !== '→') continue;
      // □(φ → ψ) → (□φ → □ψ)
      const boxAnt = mkTemporal('□', inner.left as Formula);
      const boxCon = mkTemporal('□', inner.right as Formula);
      derived.push(mkBinary('→', boxAnt, boxCon));
    }
    return derived;
  }
}

/** □φ  ⊢  ◊φ  (T-axiom / D-axiom for temporal: always implies eventually) */
class TemporalTRule implements TDFOLInferenceRule {
  readonly name = 'TemporalTRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const t = f as TemporalFormulaTDFOL;
      if (t.kind === 'temporal' && t.operator === '□') {
        derived.push(mkTemporal('◊', t.formula));
      }
    }
    return derived;
  }
}

/** O(φ → ψ), O(φ)  ⊢  O(ψ)  (Deontic Distribution) */
class DeonticDistributionRule implements TDFOLInferenceRule {
  readonly name = 'DeonticDistributionRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    const all = kb.getFormulas();
    for (const f1 of all) {
      const d1 = f1 as DeonticFormulaTDFOL;
      if (d1.kind !== 'deontic' || d1.operator !== 'O') continue;
      const inner = d1.formula as BinaryFormula;
      if (inner.kind !== 'binary' || inner.operator !== '→') continue;
      for (const f2 of all) {
        const d2 = f2 as DeonticFormulaTDFOL;
        if (d2.kind !== 'deontic' || d2.operator !== 'O') continue;
        if (d2.formula?.toStr?.() !== (inner.left as Formula)?.toStr?.()) continue;
        derived.push(mkDeontic('O', inner.right as Formula));
      }
    }
    return derived;
  }
}

/** O(φ → ψ)  ⊢  O(φ) → O(ψ)  (Deontic Necessitation) */
class DeonticNecessitationRule implements TDFOLInferenceRule {
  readonly name = 'DeonticNecessitationRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const d = f as DeonticFormulaTDFOL;
      if (d.kind !== 'deontic' || d.operator !== 'O') continue;
      const inner = d.formula as BinaryFormula;
      if (inner.kind !== 'binary' || inner.operator !== '→') continue;
      derived.push(mkBinary('→', mkDeontic('O', inner.left as Formula), mkDeontic('O', inner.right as Formula)));
    }
    return derived;
  }
}

/** O(φ)  ⊢  P(φ)  (Deontic D-rule: obligatory implies permissible) */
class DeonticDRule implements TDFOLInferenceRule {
  readonly name = 'DeonticDRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const d = f as DeonticFormulaTDFOL;
      if (d.kind === 'deontic' && d.operator === 'O') {
        derived.push(mkDeontic('P', d.formula));
      }
    }
    return derived;
  }
}

/** F(φ)  ⊢  O(¬φ)  (Prohibition elimination: forbidden ≡ obligatorily not) */
class ProhibitionEliminationRule implements TDFOLInferenceRule {
  readonly name = 'ProhibitionEliminationRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const d = f as DeonticFormulaTDFOL;
      if (d.kind === 'deontic' && d.operator === 'F') {
        // F(φ) → O(¬φ)  — produce the implication
        const negPhi = { ...d.formula } as Formula;
        derived.push(mkBinary('→', d as Formula, mkDeontic('O', negPhi)));
      }
    }
    return derived;
  }
}

/** O(φ)  ⊢  P(φ) (synonym for D-rule, named PermissionIntroduction) */
class PermissionIntroductionRule implements TDFOLInferenceRule {
  readonly name = 'PermissionIntroductionRule';

  apply(kb: TDFOLKnowledgeBase): Formula[] {
    // Same as DeonticDRule — no duplicates since KB deduplicates by toStr
    const derived: Formula[] = [];
    for (const f of kb.getFormulas()) {
      const d = f as DeonticFormulaTDFOL;
      if (d.kind === 'deontic' && d.operator === 'O') {
        derived.push(mkDeontic('P', d.formula));
      }
    }
    return derived;
  }
}

/** Factory for all default built-in rules. */
export function defaultTdfolRules(): TDFOLInferenceRule[] {
  return [
    new TemporalNecessitationRule(),
    new DeonticNecessitationRule(),
    new TemporalDistributionRule(),
    new DeonticDistributionRule(),
    new TemporalTRule(),
    new DeonticDRule(),
    new ProhibitionEliminationRule(),
    new PermissionIntroductionRule(),
  ];
}

// ---------------------------------------------------------------------------
// TDFOLProver
// ---------------------------------------------------------------------------

export interface TDFOLProverOptions {
  /** Rules to use (defaults to `defaultTdfolRules()`). */
  rules?: TDFOLInferenceRule[];
  /** Max forward-chaining iterations (default 50). */
  maxIterations?: number;
  /** Modal logic type for tableaux fallback (default K). */
  logicType?: ModalLogicType;
}

export class TDFOLProver {
  private kb: TDFOLKnowledgeBase;
  private rules: TDFOLInferenceRule[];
  private maxIterations: number;
  private logicType: ModalLogicType;

  constructor(kb?: TDFOLKnowledgeBase, opts: TDFOLProverOptions = {}) {
    this.kb = kb ?? new TDFOLKnowledgeBase();
    this.rules = opts.rules ?? defaultTdfolRules();
    this.maxIterations = opts.maxIterations ?? 50;
    this.logicType = opts.logicType ?? ModalLogicType.K;
  }

  /**
   * Attempt to prove `goal` using:
   * 1. Direct axiom/theorem lookup (O(1))
   * 2. Forward-chaining with built-in rules
   * 3. Modal tableaux fallback
   */
  prove(goal: Formula, _timeoutMs = 5000): ProofResult {
    if (!goal) {
      return { status: ProofStatus.ERROR, formula: null, proofSteps: [], timeMs: 0, method: 'validation', message: 'goal must not be null' };
    }

    const t0 = Date.now();

    // 1. Axiom lookup
    const axioms = this.kb.getByRole('axiom');
    for (const f of axioms) {
      if (f.toStr() === goal.toStr()) {
        return {
          status: ProofStatus.PROVED, formula: goal,
          proofSteps: [{ formula: goal, justification: 'Axiom in knowledge base' }],
          timeMs: Date.now() - t0, method: 'axiom_lookup',
        };
      }
    }

    // 2. Theorem lookup
    const theorems = this.kb.getByRole('theorem');
    for (const f of theorems) {
      if (f.toStr() === goal.toStr()) {
        return {
          status: ProofStatus.PROVED, formula: goal,
          proofSteps: [{ formula: goal, justification: 'Theorem in knowledge base' }],
          timeMs: Date.now() - t0, method: 'theorem_lookup',
        };
      }
    }

    // 3. Forward-chaining
    const workingKb = new TDFOLKnowledgeBase();
    for (const f of this.kb.getByRole('axiom')) workingKb.addAxiom(f);
    for (const f of this.kb.getByRole('theorem')) workingKb.addTheorem(f);

    const proofSteps: ProofStep[] = [];
    const goalStr = goal.toStr();

    for (let iter = 0; iter < this.maxIterations; iter++) {
      let anyNew = false;
      for (const rule of this.rules) {
        const derived = rule.apply(workingKb);
        for (const f of derived) {
          const fStr = f.toStr();
          // Check if already in KB
          const existing = workingKb.getFormulas().some(g => g.toStr() === fStr);
          if (!existing) {
            workingKb.addTheorem(f);
            proofSteps.push({ formula: f, justification: rule.name });
            anyNew = true;
            if (fStr === goalStr) {
              return {
                status: ProofStatus.PROVED, formula: goal,
                proofSteps: [...proofSteps, { formula: goal, justification: `Derived by ${rule.name}` }],
                timeMs: Date.now() - t0, method: 'forward_chaining',
              };
            }
          }
        }
      }
      if (!anyNew) break;
    }

    // 4. Modal tableaux fallback — check if goal is a tautology
    const tableaux = new ModalTableaux(this.logicType);
    const result = tableaux.prove(goal);
    if (result.isValid) {
      return {
        status: ProofStatus.PROVED, formula: goal,
        proofSteps: result.proofSteps.map(s => ({ formula: goal, justification: s })),
        timeMs: Date.now() - t0, method: 'modal_tableaux',
      };
    }

    return {
      status: ProofStatus.FAILED, formula: goal,
      proofSteps,
      timeMs: Date.now() - t0, method: 'exhausted',
      message: 'Could not prove formula by axiom lookup, forward chaining, or tableaux',
    };
  }
}
