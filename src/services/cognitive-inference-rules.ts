/**
 * Cognitive Inference Rules — T-238 (Sprint 53)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/inference_rules/cognitive.py
 *
 * 10 cognitive logic inference rules for CEC.
 * Each rule works on string-encoded formulas using a lightweight pattern:
 *   B(agent, φ)  — agent believes φ
 *   K(agent, φ)  — agent knows φ
 *   I(agent, φ)  — agent intends φ
 *   P(agent, φ)  — agent perceives φ
 *   D(agent, φ)  — agent desires φ
 */

// ---------------------------------------------------------------------------
// Shared types (string-formula abstraction)
// ---------------------------------------------------------------------------

export interface CognitiveInferenceRule {
  readonly name: string;
  readonly description: string;
  canApply(formulas: string[]): boolean;
  apply(formulas: string[]): string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BELIEF_RE     = /^B\((\w+),\s*(.+)\)$/;
const KNOWLEDGE_RE  = /^K\((\w+),\s*(.+)\)$/;
const INTENTION_RE  = /^I\((\w+),\s*(.+)\)$/;
const PERCEPTION_RE = /^P\((\w+),\s*(.+)\)$/;
const DESIRE_RE     = /^D\((\w+),\s*(.+)\)$/;

function parseCognitive(f: string, re: RegExp): { agent: string; prop: string } | null {
  const m = f.match(re);
  return m ? { agent: m[1], prop: m[2].trim() } : null;
}

/** True if `f` is a conjunction of the form `A ∧ B`. */
function isConjunction(f: string): boolean { return f.includes('∧'); }

/** Split top-level conjunction at the first `∧` (respects paren depth). */
function splitConjunction(f: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') depth++;
    else if (f[i] === ')') depth--;
    else if (depth === 0 && f[i] === '∧') {
      return [f.slice(0, i).trim(), f.slice(i + 1).trim()];
    }
  }
  return null;
}

/** Find top-level `→` (respects parens). */
function findImplication(f: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') depth++;
    else if (f[i] === ')') depth--;
    else if (depth === 0 && f[i] === '→') {
      return [f.slice(0, i).trim(), f.slice(i + 1).trim()];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 10 Cognitive Inference Rules
// ---------------------------------------------------------------------------

/** B(agent, P∧Q) ⊢ B(agent,P), B(agent,Q) */
export class BeliefDistribution implements CognitiveInferenceRule {
  readonly name = 'BeliefDistribution';
  readonly description = 'B(agent, P∧Q) ⊢ B(agent,P) ∧ B(agent,Q)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => { const b = parseCognitive(f, BELIEF_RE); return b ? isConjunction(b.prop) : false; });
  }

  apply(formulas: string[]): string[] {
    for (const f of formulas) {
      const b = parseCognitive(f, BELIEF_RE);
      if (!b || !isConjunction(b.prop)) continue;
      const parts = splitConjunction(b.prop);
      if (!parts) continue;
      return [`B(${b.agent}, ${parts[0]})`, `B(${b.agent}, ${parts[1]})`];
    }
    return [];
  }
}

/** K(agent, P) ⊢ B(agent, P) */
export class KnowledgeImpliesBelief implements CognitiveInferenceRule {
  readonly name = 'KnowledgeImpliesBelief';
  readonly description = 'K(agent, P) ⊢ B(agent, P)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => parseCognitive(f, KNOWLEDGE_RE) !== null);
  }

  apply(formulas: string[]): string[] {
    for (const f of formulas) {
      const k = parseCognitive(f, KNOWLEDGE_RE);
      if (k) return [`B(${k.agent}, ${k.prop})`];
    }
    return [];
  }
}

/** B(agent, P), P→Q ⊢ B(agent, Q) */
export class BeliefMonotonicity implements CognitiveInferenceRule {
  readonly name = 'BeliefMonotonicity';
  readonly description = 'B(agent, P) ∧ (P→Q) ⊢ B(agent, Q)';

  canApply(formulas: string[]): boolean {
    const beliefs = formulas.filter(f => parseCognitive(f, BELIEF_RE));
    const impls   = formulas.filter(f => findImplication(f) !== null);
    return beliefs.length > 0 && impls.length > 0;
  }

  apply(formulas: string[]): string[] {
    for (const fb of formulas) {
      const b = parseCognitive(fb, BELIEF_RE);
      if (!b) continue;
      for (const fi of formulas) {
        const impl = findImplication(fi);
        if (impl && impl[0] === b.prop) {
          return [`B(${b.agent}, ${impl[1]})`];
        }
      }
    }
    return [];
  }
}

/** I(agent, P) ∧ B(agent, P→Q) ⊢ I(agent, Q) */
export class IntentionCommitment implements CognitiveInferenceRule {
  readonly name = 'IntentionCommitment';
  readonly description = 'I(agent, P) ∧ B(agent, P→Q) ⊢ I(agent, Q)';

  canApply(formulas: string[]): boolean {
    const intents = formulas.filter(f => parseCognitive(f, INTENTION_RE));
    const beliefs  = formulas.filter(f => parseCognitive(f, BELIEF_RE));
    return intents.length > 0 && beliefs.some(f => { const b = parseCognitive(f, BELIEF_RE)!; return findImplication(b.prop) !== null; });
  }

  apply(formulas: string[]): string[] {
    for (const fi of formulas) {
      const intent = parseCognitive(fi, INTENTION_RE);
      if (!intent) continue;
      for (const fb of formulas) {
        const belief = parseCognitive(fb, BELIEF_RE);
        if (!belief || belief.agent !== intent.agent) continue;
        const impl = findImplication(belief.prop);
        if (impl && impl[0] === intent.prop) return [`I(${intent.agent}, ${impl[1]})`];
      }
    }
    return [];
  }
}

/** B(agent, P) ∧ B(agent, Q) ⊢ B(agent, P∧Q) */
export class BeliefConjunction implements CognitiveInferenceRule {
  readonly name = 'BeliefConjunction';
  readonly description = 'B(a,P) ∧ B(a,Q) ⊢ B(a, P∧Q)';

  canApply(formulas: string[]): boolean {
    const beliefs = formulas.map(f => parseCognitive(f, BELIEF_RE)).filter(Boolean);
    return beliefs.length >= 2;
  }

  apply(formulas: string[]): string[] {
    const beliefs = formulas.map(f => parseCognitive(f, BELIEF_RE)).filter(Boolean) as { agent: string; prop: string }[];
    if (beliefs.length < 2) return [];
    const [b0, b1] = beliefs;
    if (b0.agent !== b1.agent) return [];
    return [`B(${b0.agent}, ${b0.prop} ∧ ${b1.prop})`];
  }
}

/** K(agent, P∧Q) ⊢ K(agent,P), K(agent,Q) */
export class KnowledgeDistribution implements CognitiveInferenceRule {
  readonly name = 'KnowledgeDistribution';
  readonly description = 'K(agent, P∧Q) ⊢ K(agent,P) ∧ K(agent,Q)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => { const k = parseCognitive(f, KNOWLEDGE_RE); return k ? isConjunction(k.prop) : false; });
  }

  apply(formulas: string[]): string[] {
    for (const f of formulas) {
      const k = parseCognitive(f, KNOWLEDGE_RE);
      if (!k || !isConjunction(k.prop)) continue;
      const parts = splitConjunction(k.prop);
      if (!parts) continue;
      return [`K(${k.agent}, ${parts[0]})`, `K(${k.agent}, ${parts[1]})`];
    }
    return [];
  }
}

/** I(agent, P) ∧ B(agent, means(P, Q)) ⊢ I(agent, Q) */
export class IntentionMeansEnd implements CognitiveInferenceRule {
  readonly name = 'IntentionMeansEnd';
  readonly description = 'I(agent, P) ∧ B(agent, P→Q) ⊢ I(agent, Q) (means-ends reasoning)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => parseCognitive(f, INTENTION_RE)) &&
           formulas.some(f => { const b = parseCognitive(f, BELIEF_RE); return b ? b.prop.startsWith('means(') : false; });
  }

  apply(formulas: string[]): string[] {
    for (const fi of formulas) {
      const intent = parseCognitive(fi, INTENTION_RE);
      if (!intent) continue;
      for (const fb of formulas) {
        const belief = parseCognitive(fb, BELIEF_RE);
        if (!belief) continue;
        const m = belief.prop.match(/^means\((.+),\s*(.+)\)$/);
        if (m && m[1].trim() === intent.prop) {
          return [`I(${intent.agent}, ${m[2].trim()})`];
        }
      }
    }
    return [];
  }
}

/** P(agent, P) ⊢ K(agent, P) */
export class PerceptionImpliesKnowledge implements CognitiveInferenceRule {
  readonly name = 'PerceptionImpliesKnowledge';
  readonly description = 'P(agent, P) ⊢ K(agent, P)';

  canApply(formulas: string[]): boolean {
    return formulas.some(f => parseCognitive(f, PERCEPTION_RE) !== null);
  }

  apply(formulas: string[]): string[] {
    for (const f of formulas) {
      const p = parseCognitive(f, PERCEPTION_RE);
      if (p) return [`K(${p.agent}, ${p.prop})`];
    }
    return [];
  }
}

/** B(agent, P) ∧ ¬P ⊢ inconsistent */
export class BeliefNegation implements CognitiveInferenceRule {
  readonly name = 'BeliefNegation';
  readonly description = 'B(agent, P) ∧ ¬P ⊢ belief_inconsistency(agent, P)';

  canApply(formulas: string[]): boolean {
    const beliefs = formulas.map(f => parseCognitive(f, BELIEF_RE)).filter(Boolean) as { agent: string; prop: string }[];
    return beliefs.some(b => formulas.includes(`¬${b.prop}`));
  }

  apply(formulas: string[]): string[] {
    for (const f of formulas) {
      const b = parseCognitive(f, BELIEF_RE);
      if (b && formulas.includes(`¬${b.prop}`)) {
        return [`belief_inconsistency(${b.agent}, ${b.prop})`];
      }
    }
    return [];
  }
}

/** K(agent, P) ∧ K(agent, Q) ⊢ K(agent, P∧Q) */
export class KnowledgeConjunction implements CognitiveInferenceRule {
  readonly name = 'KnowledgeConjunction';
  readonly description = 'K(a,P) ∧ K(a,Q) ⊢ K(a, P∧Q)';

  canApply(formulas: string[]): boolean {
    return formulas.filter(f => parseCognitive(f, KNOWLEDGE_RE)).length >= 2;
  }

  apply(formulas: string[]): string[] {
    const knows = formulas.map(f => parseCognitive(f, KNOWLEDGE_RE)).filter(Boolean) as { agent: string; prop: string }[];
    if (knows.length < 2) return [];
    const [k0, k1] = knows;
    if (k0.agent !== k1.agent) return [];
    return [`K(${k0.agent}, ${k0.prop} ∧ ${k1.prop})`];
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ALL_COGNITIVE_RULES: CognitiveInferenceRule[] = [
  new BeliefDistribution(),
  new KnowledgeImpliesBelief(),
  new BeliefMonotonicity(),
  new IntentionCommitment(),
  new BeliefConjunction(),
  new KnowledgeDistribution(),
  new IntentionMeansEnd(),
  new PerceptionImpliesKnowledge(),
  new BeliefNegation(),
  new KnowledgeConjunction(),
];

export function findApplicableCognitiveRules(formulas: string[]): CognitiveInferenceRule[] {
  return ALL_COGNITIVE_RULES.filter(r => r.canApply(formulas));
}
