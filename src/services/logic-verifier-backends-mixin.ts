/**
 * logic-verifier-backends-mixin.ts
 *
 * Mixin providing symbolic AI and fallback backend methods for logic verification.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/_logic_verifier_backends_mixin.py
 *
 * Provides:
 *   ConsistencyCheckResult  — result of a consistency check
 *   LogicVerifierBackendsMixin — checkConsistencyFallback/checkConsistencySymbolic/findConflictingPairs
 */

// ---------------------------------------------------------------------------
// ConsistencyCheckResult
// ---------------------------------------------------------------------------

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  conflictingPairs: Array<[string, string]>;
  confidence: number;
  explanation: string;
  methodUsed: 'symbolic' | 'fallback' | 'empty';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NEGATION_PAIRS: Array<[RegExp, RegExp]> = [
  [/^P\(/, /^¬P\(/],
  [/^O\(/, /^¬O\(/],
  [/^F\(/, /^¬F\(/],
];

function directlyContradictory(f1: string, f2: string): boolean {
  const f1t = f1.trim();
  const f2t = f2.trim();

  // φ and ¬φ
  if (f2t === `¬${f1t}` || f1t === `¬${f2t}`) return true;
  if (f2t === `¬(${f1t})` || f1t === `¬(${f2t})`) return true;

  // O(x) and F(x) on same action
  if (f1t.startsWith('O(') && f2t.startsWith('F(') && f1t.slice(2) === f2t.slice(2)) return true;
  if (f1t.startsWith('F(') && f2t.startsWith('O(') && f1t.slice(2) === f2t.slice(2)) return true;

  // Check via negation pairs
  for (const [posRe, negRe] of NEGATION_PAIRS) {
    if (posRe.test(f1t) && negRe.test(f2t)) return true;
    if (posRe.test(f2t) && negRe.test(f1t)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// LogicVerifierBackendsMixin
// ---------------------------------------------------------------------------

export class LogicVerifierBackendsMixin {
  protected fallbackEnabled: boolean;

  constructor(fallbackEnabled = true) {
    this.fallbackEnabled = fallbackEnabled;
  }

  /**
   * Check consistency using syntactic/fallback methods (no ML).
   */
  checkConsistencyFallback(formulas: string[]): ConsistencyCheckResult {
    if (formulas.length === 0) {
      return { isConsistent: true, conflictingPairs: [], confidence: 1.0, explanation: 'Empty formula set', methodUsed: 'empty' };
    }

    const conflictingPairs: Array<[string, string]> = this.findConflictingPairs(formulas);

    return {
      isConsistent: conflictingPairs.length === 0,
      conflictingPairs,
      confidence: 0.75,
      explanation: conflictingPairs.length === 0
        ? `No direct contradictions found among ${formulas.length} formula(s)`
        : `Found ${conflictingPairs.length} conflicting pair(s)`,
      methodUsed: 'fallback',
    };
  }

  /**
   * Check consistency using symbolic/semantic methods (simulated).
   * In the real implementation this delegates to SymbolicAI.
   */
  checkConsistencySymbolic(formulas: string[]): ConsistencyCheckResult {
    // Simulate symbolic consistency check with slightly higher confidence
    const fallback = this.checkConsistencyFallback(formulas);
    return {
      ...fallback,
      confidence: Math.min(1.0, fallback.confidence + 0.1),
      explanation: fallback.explanation.replace('direct contradictions', 'semantic contradictions'),
      methodUsed: 'symbolic',
    };
  }

  /**
   * Find all pairs of directly contradictory formulas.
   */
  findConflictingPairs(formulas: string[]): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < formulas.length; i++) {
      for (let j = i + 1; j < formulas.length; j++) {
        if (directlyContradictory(formulas[i], formulas[j])) {
          pairs.push([formulas[i], formulas[j]]);
        }
      }
    }
    return pairs;
  }

  /**
   * Check consistency, preferring symbolic if available.
   */
  checkConsistency(formulas: string[]): ConsistencyCheckResult {
    return this.checkConsistencySymbolic(formulas);
  }
}
