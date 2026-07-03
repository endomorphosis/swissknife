/**
 * deontic-formula-builder.ts
 *
 * Build deterministic deontic/frame-logic formula strings from LegalNormIR.
 * TypeScript port of ipfs_datasets_py/logic/deontic/formula_builder.py
 *   (focused on the public API: buildDeonticFormulaFromIR + helpers)
 *
 * Provides:
 *   normalizePredicateName()     — legal phrase → stable predicate symbol
 *   canonicalModalityOperator()  — modality string → O | P | F | DEF | … | ""
 *   buildDeonticFormulaFromIR()  — LegalNormIR → deontic formula string
 *   buildDeonticFormulasFromIRList() — LegalNormIR[] → string[]
 */

import type { LegalNormIR } from './deontic/legal-norm-ir.js';

// ---------------------------------------------------------------------------
// normalizePredicateName
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
]);

/**
 * Normalize a legal phrase to a stable PascalCase predicate symbol.
 *
 * @example
 *   normalizePredicateName('the right to privacy') → 'RightPrivacy'
 *   normalizePredicateName('apply for benefits')    → 'ApplyForBenefits'
 */
export function normalizePredicateName(name: string): string {
  if (!name?.trim()) return 'P';

  // Replace underscores/hyphens with spaces, strip non-alphanumeric
  let clean = String(name)
    .replace(/[_\-]+/g, ' ')
    .replace(/[^0-9A-Za-z\s]/g, '');

  const words = clean.trim().split(/\s+/);
  if (words.length === 0) return 'P';

  // Preserve "for" when preceded by apply/applies/applied/applying (see Python)
  const protectedIndices = new Set<number>();
  if (
    words.length >= 2 &&
    /^appli(y|es|ed|ying)$/i.test(words[0]) &&
    words[1].toLowerCase() === 'for'
  ) {
    protectedIndices.add(1);
  }

  const filtered = words.filter(
    (w, i) => protectedIndices.has(i) || !STOP_WORDS.has(w.toLowerCase())
  );

  if (filtered.length === 0) return 'P';

  const predicate = filtered.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  // Must start with alpha
  return /^[A-Za-z]/.test(predicate) ? predicate : `N${predicate}`;
}

// ---------------------------------------------------------------------------
// canonicalModalityOperator
// ---------------------------------------------------------------------------

const CANONICAL_MODALITY_OPS = new Set(['O', 'P', 'F', 'DEF', 'APP', 'EXEMPT', 'LIFE', 'PURP']);

const NORM_TYPE_MAP: Record<string, string> = {
  obligation: 'O',
  mandatory_obligation: 'O',
  duty: 'O',
  requirement: 'O',
  penalty: 'O',
  sanction: 'O',
  permission: 'P',
  entitlement: 'P',
  authorization: 'P',
  prohibition: 'F',
  violation: 'F',
  offense: 'F',
  infraction: 'F',
  definition: 'DEF',
  applicability: 'APP',
  exemption: 'EXEMPT',
  instrument_lifecycle: 'LIFE',
  purpose: 'PURP',
};

const TEXTUAL_MAP: Record<string, string> = {
  obligation: 'O', obligatory: 'O', duty: 'O', must: 'O', shall: 'O',
  required: 'O', requirement: 'O', mandatory: 'O',
  permission: 'P', permitted: 'P', may: 'P', authorized: 'P', allowed: 'P',
  entitled: 'P', entitlement: 'P',
  prohibition: 'F', prohibited: 'F', forbidden: 'F', 'must not': 'F',
  'shall not': 'F', 'may not': 'F', cannot: 'F', 'can not': 'F',
  'not permitted': 'F', 'not allowed': 'F', violation: 'F', offense: 'F',
  infraction: 'F',
  definition: 'DEF', defined: 'DEF', means: 'DEF',
  applicability: 'APP', applies: 'APP', applies_to: 'APP',
  exemption: 'EXEMPT', exempt: 'EXEMPT', exempted: 'EXEMPT',
  lifecycle: 'LIFE', instrument_lifecycle: 'LIFE', expires: 'LIFE',
  purpose: 'PURP', 'in order to': 'PURP', 'for the purpose': 'PURP',
};

function modalityFromText(text: string): string {
  const lower = text.trim().toLowerCase();
  // Try direct lookup
  if (TEXTUAL_MAP[lower]) return TEXTUAL_MAP[lower];
  // Try prefix matching for longer phrases
  for (const [key, op] of Object.entries(TEXTUAL_MAP)) {
    if (lower.includes(key)) return op;
  }
  return '';
}

/**
 * Return the canonical deontic operator for a modality/norm_type pair.
 * Returns '' when the operator cannot be determined.
 */
export function canonicalModalityOperator(modality: string, normType = ''): string {
  const rawModality = String(modality ?? '').trim();
  if (rawModality) {
    const upper = rawModality.toUpperCase();
    if (CANONICAL_MODALITY_OPS.has(upper)) return upper;
    const inferred = modalityFromText(rawModality);
    if (inferred) return inferred;
  }
  const normTypeLower = String(normType ?? '').trim().toLowerCase();
  if (normTypeLower) {
    const mapped = NORM_TYPE_MAP[normTypeLower];
    if (mapped) return mapped;
    const inferred = modalityFromText(normTypeLower);
    if (inferred) return inferred;
  }
  return '';
}

// ---------------------------------------------------------------------------
// buildDeonticFormulaFromIR
// ---------------------------------------------------------------------------

function normModality(norm: LegalNormIR): string {
  const canonical = canonicalModalityOperator(norm.modality, norm.norm_type);
  return canonical || String(norm.modality ?? '').trim().toUpperCase();
}

function applicabilityTarget(action: string): string {
  const lower = action.toLowerCase();
  if (lower.startsWith('apply to ')) return action.slice('apply to '.length);
  if (lower.startsWith('applies to ')) return action.slice('applies to '.length);
  if (lower.startsWith('applicable to ')) return action.slice('applicable to '.length);
  return action;
}

function normFormula(operator: string, subject: string, action: string): string {
  const sub = normalizePredicateName(subject);
  const act = normalizePredicateName(action);
  return `${operator}(${sub}, ${act})`;
}

/**
 * Build a deterministic deontic/frame-logic formula string from a LegalNormIR.
 *
 * @example
 *   buildDeonticFormulaFromIR({ modality: 'O', actor: 'Person', action: 'Register' })
 *   // → 'O(Person, Register)'
 *   buildDeonticFormulaFromIR({ modality: 'DEF', actor: 'Agency' })
 *   // → 'Definition(Agency)'
 */
export function buildDeonticFormulaFromIR(norm: LegalNormIR): string {
  const operator = normModality(norm);

  if (operator === 'DEF') {
    const subject = normalizePredicateName(norm.actor || 'DefinedTerm');
    return `Definition(${subject})`;
  }

  if (operator === 'PURP' || norm.norm_type === 'purpose') {
    const subject = normalizePredicateName(norm.actor || 'Entity');
    const action = normalizePredicateName(norm.action || 'Purpose');
    return `Purpose(${subject}, ${action})`;
  }

  if (operator === 'APP') {
    const subject = normalizePredicateName(norm.actor || 'Scope');
    const target = normalizePredicateName(applicabilityTarget(norm.action || 'Apply'));
    return `AppliesTo(${subject}, ${target})`;
  }

  if (operator === 'EXEMPT') {
    const subject = normalizePredicateName(norm.actor || 'Entity');
    let actionText = norm.action || 'Requirement';
    if (actionText.toLowerCase().startsWith('exempt from ')) {
      actionText = actionText.slice('exempt from '.length);
    }
    return `ExemptFrom(${subject}, ${normalizePredicateName(actionText)})`;
  }

  if (operator === 'LIFE' || norm.norm_type === 'instrument_lifecycle') {
    const subject = normalizePredicateName(norm.actor || 'Instrument');
    const actionText = norm.action || 'lifecycle';
    const lower = actionText.toLowerCase();
    if (lower.startsWith('valid for ')) {
      return `ValidFor(${subject}, ${normalizePredicateName(actionText.slice('valid for '.length))})`;
    }
    if (lower.startsWith('expires ')) {
      return `ExpiresAfter(${subject}, ${normalizePredicateName(actionText.slice('expires '.length))})`;
    }
    if (lower.startsWith('repealed')) return `Repealed(${subject})`;
    if (lower.startsWith('omitted')) return `Omitted(${subject})`;
    if (lower.startsWith('reserved')) return `Reserved(${subject})`;
    if (lower.startsWith('transferred')) return `Transferred(${subject})`;
    return `Lifecycle(${subject}, ${normalizePredicateName(actionText)})`;
  }

  // Default: O / P / F (or unknown → treat as O)
  const op = operator || 'O';
  const subject = norm.actor || 'Agent';
  const action = norm.action || 'Act';
  return normFormula(op, subject, action);
}

/**
 * Build formula strings for a list of norms.
 */
export function buildDeonticFormulasFromIRList(norms: LegalNormIR[]): string[] {
  return norms.map(n => buildDeonticFormulaFromIR(n));
}
