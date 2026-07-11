/**
 * NormativeConflictDetector — identify and categorise deontic norm conflicts.
 *
 * Mirrors:
 *   ipfs_datasets_py/logic/deontic/utils/deontic_parser.py:
 *     identify_obligations(elements)
 *     detect_normative_conflicts(elements)
 *     _check_conflict_pair(elem1, elem2)
 *
 * Sprint 18, T-97.
 * Reference: ipfs_datasets_py/logic/deontic/utils/deontic_parser.py §detect_normative_conflicts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormElement {
  readonly norm_type?:        string;
  readonly deontic_operator?: string;
  readonly subject?:          string | string[];
  readonly proposition?:      string | string[];
  readonly action?:           string | string[];
  readonly conditions?:       Array<Record<string, unknown>>;
  readonly temporal_constraints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type ConflictType = 'direct' | 'permission_conflict' | 'conditional' | 'temporal';

export interface NormConflict {
  readonly type:                ConflictType;
  readonly element_indices:     [number, number];
  readonly elements:            [NormElement, NormElement];
  readonly severity:            'high' | 'medium' | 'low';
  readonly description:         string;
  readonly resolution_strategies: string[];
}

/** Categorised view of extracted norm elements. */
export interface ObligationsView {
  readonly obligations:       NormElement[];
  readonly permissions:       NormElement[];
  readonly prohibitions:      NormElement[];
  readonly conditional_norms: NormElement[];
  readonly temporal_norms:    NormElement[];
}

// ---------------------------------------------------------------------------
// identify_obligations
// ---------------------------------------------------------------------------

/**
 * Categorise norm elements by their deontic type.
 *
 * Python ref: `identify_obligations(elements)` in deontic_parser.py.
 */
export function identifyObligations(elements: NormElement[]): ObligationsView {
  const result: ObligationsView = {
    obligations:       [],
    permissions:       [],
    prohibitions:      [],
    conditional_norms: [],
    temporal_norms:    [],
  };

  for (const el of elements) {
    const nt = (el.norm_type ?? '').toLowerCase();
    const op = (el.deontic_operator ?? '').toUpperCase();

    if (nt === 'obligation' || op === 'O') {
      (result.obligations as NormElement[]).push(el);
    } else if (nt === 'permission' || op === 'P') {
      (result.permissions as NormElement[]).push(el);
    } else if (nt === 'prohibition' || op === 'F') {
      (result.prohibitions as NormElement[]).push(el);
    }

    const conditions = el.conditions ?? [];
    if (Array.isArray(conditions) && conditions.length > 0) {
      (result.conditional_norms as NormElement[]).push(el);
    }

    const temporal = el.temporal_constraints ?? [];
    if (Array.isArray(temporal) && temporal.length > 0) {
      (result.temporal_norms as NormElement[]).push(el);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// detect_normative_conflicts
// ---------------------------------------------------------------------------

/**
 * Detect normative conflicts between pairs of elements.
 *
 * Detects:
 *   1. Direct conflicts:      O(p) ∧ F(p)   (obligation vs prohibition)
 *   2. Permission conflicts:  P(p) ∧ F(p)   (permission vs prohibition)
 *   3. Conditional conflicts: overlapping conditions with conflicting modalities
 *   4. Temporal conflicts:    overlapping time periods with conflicting modalities
 *
 * Python ref: `detect_normative_conflicts(elements)` in deontic_parser.py.
 */
export function detectNormativeConflicts(elements: NormElement[]): NormConflict[] {
  const conflicts: NormConflict[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const conflict = _checkConflictPair(elements[i], elements[j], i, j);
      if (conflict) conflicts.push(conflict);
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _firstText(v: unknown): string {
  if (Array.isArray(v)) return String((v as unknown[]).find(Boolean) ?? '');
  return String(v ?? '');
}

function _actionsSimilar(a1: string, a2: string): boolean {
  if (!a1 || !a2) return false;
  const w1 = new Set(a1.split(/\s+/));
  const w2 = new Set(a2.split(/\s+/));
  const inter = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return union > 0 && inter / union >= 0.6;
}

function _subjectsSimilar(s1: string, s2: string): boolean {
  if (!s1 && !s2) return true;  // both blank → treat as same subject
  if (!s1 || !s2) return false;
  return _actionsSimilar(s1, s2);
}

function _checkConflictPair(
  e1: NormElement,
  e2: NormElement,
  i: number,
  j: number,
): NormConflict | null {
  const nt1 = (e1.norm_type ?? '').toLowerCase();
  const nt2 = (e2.norm_type ?? '').toLowerCase();
  const op1 = (e1.deontic_operator ?? nt1).toUpperCase();
  const op2 = (e2.deontic_operator ?? nt2).toUpperCase();

  const action1 = _firstText(e1.proposition ?? e1.action).toLowerCase().trim();
  const action2 = _firstText(e2.proposition ?? e2.action).toLowerCase().trim();
  const subject1 = _firstText(e1.subject).toLowerCase().trim();
  const subject2 = _firstText(e2.subject).toLowerCase().trim();

  if (!action1 || !action2) return null;
  if (!_actionsSimilar(action1, action2)) return null;
  if (!_subjectsSimilar(subject1, subject2)) return null;

  // 1. Direct conflict: O + F
  if ((op1 === 'O' && op2 === 'F') || (op1 === 'F' && op2 === 'O')) {
    return {
      type: 'direct',
      element_indices: [i, j],
      elements: [e1, e2],
      severity: 'high',
      description: `Direct conflict: ${op1}(${action1}) vs ${op2}(${action2})`,
      resolution_strategies: [
        'Apply hierarchical precedence',
        'Restrict scope of one norm',
        'Add conditional exception',
      ],
    };
  }

  // 2. Permission conflict: P + F
  if ((op1 === 'P' && op2 === 'F') || (op1 === 'F' && op2 === 'P')) {
    return {
      type: 'permission_conflict',
      element_indices: [i, j],
      elements: [e1, e2],
      severity: 'medium',
      description: `Permission conflict: ${op1}(${action1}) vs ${op2}(${action2})`,
      resolution_strategies: [
        'Apply conflict-of-laws principle',
        'Specify priority ordering',
        'Add temporal scope',
      ],
    };
  }

  // 3. Conditional conflict
  const cond1 = (e1.conditions ?? []) as Array<Record<string, unknown>>;
  const cond2 = (e2.conditions ?? []) as Array<Record<string, unknown>>;
  if (cond1.length > 0 && cond2.length > 0 && op1 !== op2) {
    const condText1 = cond1.map(c => String(c['text'] ?? '')).filter(Boolean);
    const condText2 = cond2.map(c => String(c['text'] ?? '')).filter(Boolean);
    const overlap = condText1.some(ct1 => condText2.some(ct2 => _actionsSimilar(ct1, ct2)));
    if (overlap) {
      return {
        type: 'conditional',
        element_indices: [i, j],
        elements: [e1, e2],
        severity: 'medium',
        description: `Conditional conflict: ${op1} vs ${op2} under overlapping conditions`,
        resolution_strategies: ['Add mutual exclusivity clause', 'Clarify condition priority'],
      };
    }
  }

  // 4. Temporal conflict
  const tc1 = (e1.temporal_constraints ?? []) as Array<Record<string, unknown>>;
  const tc2 = (e2.temporal_constraints ?? []) as Array<Record<string, unknown>>;
  if (tc1.length > 0 && tc2.length > 0 && op1 !== op2) {
    return {
      type: 'temporal',
      element_indices: [i, j],
      elements: [e1, e2],
      severity: 'low',
      description: `Temporal conflict: ${op1} vs ${op2} with overlapping time constraints`,
      resolution_strategies: ['Specify effective dates', 'Apply later-in-time rule'],
    };
  }

  return null;
}
