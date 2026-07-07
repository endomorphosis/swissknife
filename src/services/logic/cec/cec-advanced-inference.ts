/**
 * CEC Advanced Inference Rules — T-228
 *
 * Port of ipfs_datasets_py/logic/CEC/native/advanced_inference.py
 *
 * 10 modal / deontic inference rule classes for CEC (Cognitive Event Calculus).
 * Each rule is self-contained and follows the pattern:
 *   name: string
 *   canApply(formulas: string[]): boolean
 *   apply(formulas: string[]): string[]
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface AdvancedInferenceRule {
  readonly name: string;
  readonly description: string;
  canApply(formulas: string[]): boolean;
  apply(formulas: string[]): string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if `formula` is a box formula □φ or K(agent, φ). */
function isBox(f: string): boolean {
  return f.startsWith('□') || /^K\(/.test(f);
}

/** True if `formula` is an implication (contains →). */
function isImplication(f: string): boolean {
  return f.includes('→');
}

/** True if formula is an obligation O(φ). */
function isObligation(f: string): boolean {
  return /^O\(/.test(f);
}

/** True if formula is a permission P(φ). */
function isPermission(f: string): boolean {
  return /^P\(/.test(f);
}

/** Extract inner formula from a box operator □φ. */
function boxInner(f: string): string {
  let inner: string;
  if (f.startsWith('□')) {
    inner = f.slice(1).trim();
  } else {
    const m = f.match(/^K\(\w+,\s*(.+)\)$/);
    inner = m ? m[1].trim() : f;
  }
  // Strip outer parentheses
  if (inner.startsWith('(') && inner.endsWith(')')) {
    inner = inner.slice(1, -1).trim();
  }
  return inner;
}

/** Extract inner formula from an obligation O(φ). */
function oblInner(f: string): string {
  const m = f.match(/^O\((.+)\)$/);
  return m ? m[1].trim() : f;
}

/** Split an implication A → B at the top-level arrow (respects parens). */
function splitImplication(f: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') depth++;
    else if (f[i] === ')') depth--;
    else if (depth === 0 && f[i] === '\u2192') {
      return [f.slice(0, i).trim(), f.slice(i + 1).trim()];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 10 Advanced Inference Rules
// ---------------------------------------------------------------------------

/** K Axiom: □(A→B) implies □A → □B */
export class ModalKAxiom implements AdvancedInferenceRule {
  readonly name = 'Modal K Axiom';
  readonly description = 'From □(A→B), derive □A → □B';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => isBox(f) && isImplication(boxInner(f)));
  }

  apply(formulas: string[]): string[] {
    const out: string[] = [];
    for (const f of formulas) {
      if (!isBox(f)) continue;
      const inner = boxInner(f);
      const parts = splitImplication(inner);
      if (!parts) continue;
      const [a, b] = parts;
      out.push(`□${a} → □${b}`);
    }
    return out;
  }
}

/** T Axiom (Reflexivity): □A → A */
export class ModalTAxiom implements AdvancedInferenceRule {
  readonly name = 'Modal T Axiom';
  readonly description = 'From □A, derive A (reflexivity)';

  canApply(formulas: string[]): boolean {
    return formulas.some(isBox);
  }

  apply(formulas: string[]): string[] {
    return formulas.filter(isBox).map(boxInner);
  }
}

/** S4 Axiom (Transitivity): □A → □□A */
export class ModalS4Axiom implements AdvancedInferenceRule {
  readonly name = 'Modal S4 Axiom';
  readonly description = 'From □A, derive □□A (transitivity)';

  canApply(formulas: string[]): boolean {
    return formulas.some(isBox);
  }

  apply(formulas: string[]): string[] {
    return formulas.filter(isBox).map(f => `□${f}`);
  }
}

/** Necessitation: if ⊢ A then ⊢ □A */
export class ModalNecessitation implements AdvancedInferenceRule {
  readonly name = 'Modal Necessitation';
  readonly description = 'If A is a theorem, derive □A';

  canApply(formulas: string[]): boolean { return formulas.length >= 1; }

  apply(formulas: string[]): string[] {
    return formulas.map(f => `□${f}`);
  }
}

/** Python-compatible misspelling retained by advanced_inference.py. */
export class ModalNecassitation implements AdvancedInferenceRule {
  readonly name = 'Necessitation';
  readonly description = 'If A is a theorem, derive K(system, A)';

  canApply(formulas: string[]): boolean { return formulas.length >= 1; }

  apply(formulas: string[]): string[] {
    return formulas.slice(0, 5).filter(f => !isBox(f)).map(f => `K(system, ${f})`);
  }
}

/** Temporal Induction: □(A → XA), A ⊢ □A */
export class TemporalInduction implements AdvancedInferenceRule {
  readonly name = 'Temporal Induction';
  readonly description = 'From □(A → XA) and A, derive □A';

  canApply(formulas: string[]): boolean {
    // Need □(A → X A) and A
    const hasInductive = formulas.some(f => isBox(f) && boxInner(f).includes('→') && boxInner(f).includes('X'));
    return hasInductive && formulas.length >= 2;
  }

  apply(formulas: string[]): string[] {
    const out: string[] = [];
    for (const f of formulas) {
      if (!isBox(f)) continue;
      const inner = boxInner(f);
      const parts = splitImplication(inner);
      if (!parts) continue;
      const [a] = parts;
      out.push(`□${a}`);
    }
    return out;
  }
}

/** Frame Axiom: □A, accessible(w, v) ⊢ □A at v */
export class FrameAxiom implements AdvancedInferenceRule {
  readonly name = 'Frame Axiom';
  readonly description = 'Box formulas persist across accessible worlds';

  canApply(formulas: string[]): boolean {
    return formulas.some(isBox);
  }

  apply(formulas: string[]): string[] {
    // In the string abstraction, frame axiom just re-asserts box formulas
    return formulas.filter(isBox);
  }
}

/** Deontic D Rule: O(A) ⊢ P(A) — obligation implies permission */
export class DeonticDRule implements AdvancedInferenceRule {
  readonly name = 'Deontic D Rule';
  readonly description = 'From O(A), derive P(A) — obligation implies permission';

  canApply(formulas: string[]): boolean {
    return formulas.some(isObligation);
  }

  apply(formulas: string[]): string[] {
    return formulas.filter(isObligation).map(f => {
      const inner = oblInner(f);
      return `P(${inner})`;
    });
  }
}

/** O(A) ∧ P(¬A) ⊢ ⊥  — obligation and permission of negation conflict */
export class DeonticPermissionObligation implements AdvancedInferenceRule {
  readonly name = 'Deontic Permission-Obligation Conflict';
  readonly description = 'Detect O(A) ∧ P(¬A) conflict';

  canApply(formulas: string[]): boolean {
    const obl = formulas.filter(isObligation).map(oblInner);
    const perm = formulas.filter(isPermission).map(f => {
      const m = f.match(/^P\((.+)\)$/);
      return m ? m[1] : f;
    });
    // Check if any obligation has corresponding negated permission
    return obl.some(a => perm.includes(`¬${a}`) || perm.includes(`not ${a}`));
  }

  apply(formulas: string[]): string[] {
    return ['⊥']; // conflict detected
  }
}

/** Deontic Distribution: O(A ∧ B) ⊢ O(A) ∧ O(B) */
export class DeonticDistribution implements AdvancedInferenceRule {
  readonly name = 'Deontic Distribution';
  readonly description = 'O(A ∧ B) distributes to O(A) ∧ O(B)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => isObligation(f) && oblInner(f).includes('∧'));
  }

  apply(formulas: string[]): string[] {
    const out: string[] = [];
    for (const f of formulas) {
      if (!isObligation(f)) continue;
      const inner = oblInner(f);
      const conjIdx = inner.indexOf('∧');
      if (conjIdx < 0) continue;
      const a = inner.slice(0, conjIdx).trim();
      const b = inner.slice(conjIdx + 1).trim();
      out.push(`O(${a})`, `O(${b})`);
    }
    return out;
  }
}

/** KnowledgeObligation: K(agent, O(A)) ⊢ O(A) */
export class KnowledgeObligation implements AdvancedInferenceRule {
  readonly name = 'Knowledge Obligation';
  readonly description = 'From K(agent, O(A)), derive O(A)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => /^K\(\w+,\s*O\(/.test(f));
  }

  apply(formulas: string[]): string[] {
    const out: string[] = [];
    for (const f of formulas) {
      const m = f.match(/^K\(\w+,\s*(O\(.+\))\)$/);
      if (m) out.push(m[1]);
    }
    return out;
  }
}

/** Temporal-deontic interaction: O(◇A) ⊢ ◇O(A), with persistence fallback for O(A). */
export class TemporalObligation implements AdvancedInferenceRule {
  readonly name = 'Temporal-Deontic Interaction';
  readonly description = 'From O(◇A), derive ◇O(A); obligations persist until fulfilled';

  canApply(formulas: string[]): boolean {
    return formulas.some(isObligation);
  }

  apply(formulas: string[]): string[] {
    const out: string[] = [];
    for (const formula of formulas.filter(isObligation)) {
      const content = oblInner(formula);
      if (content.startsWith('◇')) {
        const eventual = content.slice(1).trim().replace(/^\((.*)\)$/, '$1');
        out.push(`◇O(${eventual})`);
      } else {
        out.push(formula);
      }
    }
    return out.slice(0, 3);
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function get_modal_rules(): AdvancedInferenceRule[] {
  return [
    new ModalKAxiom(),
    new ModalTAxiom(),
    new ModalS4Axiom(),
    new ModalNecassitation(),
  ];
}

export function get_temporal_rules(): AdvancedInferenceRule[] {
  return [
    new TemporalInduction(),
    new FrameAxiom(),
  ];
}

export function get_deontic_rules(): AdvancedInferenceRule[] {
  return [
    new DeonticDRule(),
    new DeonticPermissionObligation(),
    new DeonticDistribution(),
  ];
}

export function get_combined_rules(): AdvancedInferenceRule[] {
  return [
    new KnowledgeObligation(),
    new TemporalObligation(),
  ];
}

export function get_all_advanced_rules(): AdvancedInferenceRule[] {
  return [
    ...get_modal_rules(),
    ...get_temporal_rules(),
    ...get_deontic_rules(),
    ...get_combined_rules(),
  ];
}

export const ALL_ADVANCED_RULES: AdvancedInferenceRule[] = get_all_advanced_rules();

export const getModalRules = get_modal_rules;
export const getTemporalRules = get_temporal_rules;
export const getDeonticRules = get_deontic_rules;
export const getCombinedRules = get_combined_rules;
export const getAllAdvancedRules = get_all_advanced_rules;

export const LEGACY_ALL_ADVANCED_RULES: AdvancedInferenceRule[] = [
  new ModalKAxiom(),
  new ModalTAxiom(),
  new ModalS4Axiom(),
  new ModalNecessitation(),
  new TemporalInduction(),
  new FrameAxiom(),
  new DeonticDRule(),
  new DeonticPermissionObligation(),
  new DeonticDistribution(),
  new KnowledgeObligation(),
];

export function findApplicableAdvancedRules(formulas: string[]): AdvancedInferenceRule[] {
  return ALL_ADVANCED_RULES.filter(r => r.canApply(formulas));
}
